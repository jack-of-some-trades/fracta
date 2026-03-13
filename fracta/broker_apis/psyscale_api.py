"API to bridge Fracta Data Requests with a Psyscale Backend + Live Data Brokers"

import sys
import asyncio
import logging
from typing import Optional, Protocol
from psyscale import PsyscaleAsync
from psyscale.dev import sql, Op, AssetTbls, AGGREGATE_ARGS, TICK_ARGS

import pandas as pd
import fracta as fta

from .alpaca_api import AlpacaAPI

log = logging.getLogger("fracta_log")

STD_ARGS = AGGREGATE_ARGS | TICK_ARGS

ALPACA_RENAME_MAP = {
    "t": "dt",
    "o": "open",
    "h": "high",
    "l": "low",
    "c": "close",
    "v": "volume",
    "vw": "vwap",
    "n": "ticks",
}


class WebSocketInterface(Protocol):
    "Protocol to Define WebSocket Owners"

    def open_socket(self, ticker: fta.Ticker, series: fta.indicators.Timeseries): ...
    def close_socket(self, series: fta.indicators.Timeseries): ...


class PsyscaleAPI:
    "API to bridge Fracta Data Requests with a Psyscale Backend + Live Data Brokers"

    def __init__(self) -> None:
        policy = asyncio.get_event_loop_policy()
        if sys.platform == "win32" and not isinstance(policy, asyncio.WindowsSelectorEventLoopPolicy):
            raise AttributeError(
                "Cannot initialize Psyscale API. Current Asyncio Evt Loop policy is incompatible with psycopg3.\n"
                "Use 'asyncio.set_event_loop_policy(WindowsSelectorEventLoopPolicy())' to make the Evt Loop compatible."
            )

        self.db = PsyscaleAsync()  # Init with env Variables
        srcs = {v.lower() for v in self.db.distinct_sources()}

        if "alpaca" in srcs:
            self.alpaca_api = AlpacaAPI()

        # Dict of Series.js_id : Data Source managing the Open Socket
        self._open_sockets: dict[str, WebSocketInterface] = {}

    async def shutdown(self):
        "Shutdown the Asyncio Workers"
        await self.db.close()
        if getattr(self, "alpaca_api", None) is not None:
            await self.alpaca_api.shutdown()

    def setup_server(self, server: fta.ServerProtocol):
        "Setup the window will appropriate search filters and event responders."
        server.events.data_request += self.get_series
        server.events.symbol_search += self.search_symbols
        server.events.open_socket += self.open_socket
        server.events.close_socket += self.close_socket

        server.set_search_filters(
            {
                "source": self.db.distinct_sources(),
                "exchange": self.db.distinct_exchanges(),
                "asset_class": self.db.distinct_asset_classes(),
            }
        )

    def search_symbols(self, symbol: str, **filters) -> list[fta.Ticker]:
        "Search the Database's stored Symbols, returning matches as Ticker Objs"
        _filters = []
        # Manually form the filters for the Symbol search. Allows for use of any operator
        if len(flts := filters["sources"]) > 0:
            _filters.append(sql.SQL("source = any({_vals})").format(_vals=flts))
        if len(flts := filters["exchanges"]) > 0:
            _filters.append(sql.SQL("exchange = any({_vals})").format(_vals=flts))
        if len(flts := filters["asset_classes"]) > 0:
            _filters.append(sql.SQL("asset_class = any({_vals})").format(_vals=flts))

        # Perform Similary match of symbol against both name + symbol columns
        rsp, _ = self.db.execute(
            self.db[Op.SELECT, AssetTbls.SYMBOLS](symbol, symbol, _filters, include_attrs=True, _limit=100),
            dict_cursor=True,
        )

        return [fta.Ticker.from_dict(v) for v in rsp]

    def get_series(self, ticker: fta.Ticker, timeframe: fta.TF) -> Optional[pd.DataFrame]:
        "Get Timeseries Data Joining data from Stored Data & Live Data Sources"

        if (pkey := ticker.get("pkey")) is None:
            # This means a Requested Symbol must be at least known to the database. Since this
            log.warning("Cannot Get Series data for ticker: %s. It lacks a Primary Key Attribute", ticker)
            return None

        stored_data, fetched_data, fetch_start = None, None, None
        if ticker.get("store"):
            mdata = self.db.inferred_metadata(pkey, timeframe.as_timedelta())
            if mdata is not None:
                fetch_start = mdata.end_date
                stored_data = self.db.get_series(
                    pkey,
                    timeframe.as_timedelta(),
                    rtn_args=STD_ARGS,
                    mdata=mdata,
                )

        # ---- Fetch Source Data ----
        if ticker.source is None:
            return stored_data

        if ticker.source.lower() == "alpaca":
            fetched_data = self.alpaca_api.get_series(ticker, timeframe, start=fetch_start)
            if fetched_data is not None:
                fetched_data.rename(columns=ALPACA_RENAME_MAP, inplace=True)

        # ---- Merge and Return ----
        dfs = (stored_data, fetched_data)
        return pd.concat(dfs) if any(df is not None for df in dfs) else None

    def open_socket(self, ticker: fta.Ticker, series: fta.indicators.Timeseries):
        "Forward the Socket Request to the appropriate Data Source"
        if ticker.source is None:
            return

        if ticker.source.lower() == "alpaca":
            self._open_sockets[series.js_id] = self.alpaca_api
            self.alpaca_api.open_socket(ticker, series)

    def close_socket(self, series: fta.indicators.Timeseries):
        "Forward the Socket close Request to the appropriate Data Source"
        if series.js_id not in self._open_sockets:
            return

        socket_manager = self._open_sockets.pop(series.js_id)
        socket_manager.close_socket(series)
