"""Realtime and Historical data stream access through alpaca"""

from datetime import datetime
import os
import asyncio
from itertools import islice
from logging import getLogger
from typing import Optional, Dict, Any, overload

from pandas import DataFrame, Timestamp

from alpaca.common.exceptions import APIError
from alpaca.trading.enums import AssetClass
from alpaca.trading.client import TradingClient
from alpaca.data.enums import Adjustment
from alpaca.data.timeframe import TimeFrame, TimeFrameUnit
from alpaca.data.historical import StockHistoricalDataClient, CryptoHistoricalDataClient
from alpaca.data.requests import CryptoBarsRequest, StockBarsRequest
from alpaca.data.live.stock import StockDataStream
from alpaca.data.live.crypto import CryptoDataStream

import fracta as fta

log = getLogger("fracta_log")

MAX_SYMBOL_SEARCH_RETURN = 200
ALPACA_API_KEYS: Dict[str, Any] = {
    "raw_data": True,
    "api_key": os.getenv("ALPACA_API_KEY"),
    "secret_key": os.getenv("ALPACA_API_SECRET_KEY"),
}


class AlpacaAPI:
    """
    API to bridge between Fracta's Event Requests and the Alpaca Trade API
    Alpaca-py is a great library for getting some data into the system for free. Too bad
    it's terrible at everything else beyond this.

    Alpaca-py seems to be desined to be the highest level event loop controller, which it's not
    in this application environment.  Couple that with the abysmal *THREE SECOND BLOCKING* retry
    timer when an API call limit is reached and this library gets very annoying.

    Furthermore, to get Alpaca-py websockets to work you need to go into the DataStream class and
    delete the .result() calls when subscribing and unsubscribing. When these are invoked they wait
    for a result from a future call... that drum-roll.. has no return data. Better yet, this
    *BLOCKING* statement prevents the program from ever returning to the event-loop to launch the
    coroutine so the entire program hangs on a blocking call that's waiting for a Future, that never
    get's launched, to return nothing. Beautiful.
    """

    # _api: alpaca.REST
    # _async_api: alpaca.AsyncRest

    def __init__(self, api_keys: dict[str, Any] = ALPACA_API_KEYS):
        self.api_keys = api_keys

        if self.api_keys.get("api_key", None) is None or self.api_keys.get("secret_key", None) is None:
            raise ValueError("ALPACA_API_KEY and/or ALPACA_SECRET_KEY were not loaded as env variables.")

        self.stock_client = StockHistoricalDataClient(**self.api_keys)
        self.crypto_client = CryptoHistoricalDataClient(**self.api_keys)
        self.stock_stream = StockDataStream(**self.api_keys)
        self.crypto_stream = CryptoDataStream(**self.api_keys)

        evt_loop = asyncio.get_running_loop()
        self.stock_task = evt_loop.create_task(self.stock_stream._run_forever())
        self.crypto_task = evt_loop.create_task(self.crypto_stream._run_forever())

        self.open_sockets: Dict[str, list[fta.indicators.Timeseries]] = {}
        self.series_ticker_map: Dict[int, str] = {}

        self._assets = None

    @property
    def assets(self) -> DataFrame:
        "Lazy Loaded Asset List of Symbols available on Alpaca."
        if self._assets is not None:
            return self._assets

        # Store Alpaca's Full asset list so it can be searched later without another API Request
        client = TradingClient(**self.api_keys, paper=True)
        # Why does this not have an Async Version? IT TAKES LIKE 3 DAMN SECONDS.
        assets_json = client.get_all_assets()
        self._assets = DataFrame(assets_json).rename(columns={"class": "asset_class"}).set_index("id")
        # Drop All OTC since they aren't Tradable
        self._assets = self._assets[self._assets.exchange != "OTC"]
        return self._assets

    def setup_server(self, server: fta.ServerProtocol):
        "Set a Pychart Window's Event Callbacks & Filters for use with Alpaca"
        server.events.data_request += self.get_series
        server.events.symbol_search += self.search_symbols
        server.events.open_socket += self.open_socket
        server.events.close_socket += self.close_socket

        server.set_search_filters(
            {
                "asset_class": ["Crypto", "Equity"],
                "source": ["Alpaca"],
                "exchange": [],
            }
        )

    async def shutdown(self):
        "Turn off the Alpaca Data Streams"
        # This would need to be refined in a final implementation, though that absolutely is
        # not worth it right now considering how much of a conflict this data-broker api is with
        # the Fracta architecture
        log.info("Shutting Down Alpaca")
        self.stock_stream.stop()
        self.crypto_stream.stop()
        await asyncio.gather(self.stock_task, self.crypto_task)

    def search_symbols(self, symbol: str, **_) -> list[fta.Ticker]:
        "Search the Active symbols on Alpaca. This ignores OTC Symbols"
        ### Currently this ignores the additional filters that are passed in the kwargs
        # Search Tickers
        matches = self.assets[self.assets["symbol"].str.contains(symbol, case=False)]
        if len(matches) > 0:
            return symbols_from_df(matches, source="alpaca")

        # Search Names if ticker search failed to return anything
        matches = self.assets[self.assets["name"].str.contains(symbol, case=False)]
        return symbols_from_df(matches, source="alpaca")

    def get_series(
        self,
        ticker: fta.Ticker,
        timeframe: fta.TF,
        start: Optional[str | datetime] = None,
        end: Optional[str | datetime] = None,
        limit: Optional[int] = 50_000,
    ) -> Optional[DataFrame]:
        "Return timeseries data for the given ticker"
        args = {
            "symbol_or_symbols": ticker.symbol,
            "timeframe": _format_time(timeframe),
        }
        if limit is not None:
            args["limit"] = limit
            # Start @ # Number of bars back so a current time is always shown
            args["start"] = str(Timestamp.now() - (50_000 * timeframe.as_timedelta()))
        if start is not None:
            args["start"] = start
        if end is not None:
            args["end"] = end

        # This library currently doesn't support async requests on history fetches.
        # To make matters worse, there's is a 3 second sleep timer in the request call
        # that gets invoked when the request limit is reached. That timer probably why
        # this is painfully slow when requesting large sets of data.

        try:
            if ticker.asset_class == AssetClass.CRYPTO:
                rsp: Dict[str, Any] = self.crypto_client.get_crypto_bars(CryptoBarsRequest(**args))  # type: ignore
                return DataFrame(rsp[ticker.symbol]) if ticker in rsp else None
            else:
                rsp: Dict[str, Any] = self.stock_client.get_stock_bars(  # type: ignore
                    StockBarsRequest(**args, adjustment=Adjustment.ALL)
                )
                return DataFrame(rsp[ticker.symbol]) if ticker.symbol in rsp else None
        except APIError as e:
            log.error("get_bars() APIError: %s", e)
            return None

    def open_socket(self, ticker: fta.Ticker, series: fta.indicators.Timeseries):
        "Open Websocket Datastream if a channel is available"
        log.info("%s Requested Socket open of %s.", series.js_id, ticker.symbol)

        if ticker.symbol not in self.assets["symbol"].unique():
            log.info("Symbol %s does not exist on Alpaca", ticker.symbol)
            return

        # Handle case where another series indicator is already listening to the given symbol
        if ticker.symbol in self.open_sockets:
            listeners = self.open_sockets[ticker.symbol]
            if series not in listeners:
                listeners.append(series)
                self.series_ticker_map[id(series)] = ticker.symbol
            log.info("Series Added as a listener to %s", ticker.symbol)
            return

        if ticker.asset_class == AssetClass.CRYPTO and not self.crypto_task.cancelled():
            self.crypto_stream.subscribe_bars(self._socket_handler, ticker.symbol)
        elif not self.stock_task.cancelled():
            self.stock_stream.subscribe_bars(self._socket_handler, ticker.symbol)
        self.open_sockets[ticker.symbol] = [series]
        self.series_ticker_map[id(series)] = ticker.symbol

    def close_socket(self, series: fta.indicators.Timeseries):
        "Close a Websocket Datastream that's no longer needed"
        if id(series) not in self.series_ticker_map:
            return

        ticker = self.series_ticker_map.pop(id(series))
        self.open_sockets[ticker].remove(series)

        if len(self.open_sockets[ticker]) == 0:
            log.info("No More Listeners on %s. Closed down socket", ticker)

            if series.ticker.asset_class == AssetClass.CRYPTO:
                self.crypto_stream.unsubscribe_bars(ticker)
            else:
                self.stock_stream.unsubscribe_bars(ticker)
            self.open_sockets.pop(ticker)

    async def _socket_handler(self, data):
        listeners = self.open_sockets.get(data.get("S"), None)

        if listeners is None:
            log.warning(
                "Recieved Data for a symbol (%s) that isnt being tracked?",
                data.get("S"),
            )
            return

        update_obj = fta.OhlcData(
            time=data.get("t").seconds * 1_000_000_000,
            open=data.get("o"),
            high=data.get("h"),
            low=data.get("l"),
            close=data.get("c"),
            volume=data.get("v"),
        )

        log.info(update_obj)

        for series in listeners:
            series.update_data(update_obj, accumulate=True)


def symbols_from_df(matches: DataFrame, **defaults) -> list[fta.Ticker]:
    "Generate a list of Symbols from a dataframe of the relevant data"
    generator = (fta.Ticker.from_dict(obj, **defaults) for obj in matches.to_dict(orient="records"))
    # Return the Given Max number of entries from a generator expression
    return list(islice(generator, MAX_SYMBOL_SEARCH_RETURN))


# region ---- ---- ---- ---- Format Timeframes  ---- ---- ---- ---- #

lwc_to_alpaca_map: Dict[fta.types.TF_PERIOD_CODES, Optional[str]] = {
    "s": None,
    "m": TimeFrameUnit.Minute,
    "h": TimeFrameUnit.Hour,
    "D": TimeFrameUnit.Day,
    "W": TimeFrameUnit.Week,
    "M": TimeFrameUnit.Month,
    "Y": None,
}
alpaca_to_lwc_map = dict((v, k) for k, v in lwc_to_alpaca_map.items())


@overload
def _format_time(timeframe: TimeFrame) -> fta.TF: ...
@overload
def _format_time(timeframe: fta.TF) -> TimeFrame: ...


def _format_time(timeframe: fta.TF | TimeFrame) -> fta.TF | TimeFrame:
    return _lwc_to_alp(timeframe) if isinstance(timeframe, fta.TF) else _alp_to_lwc(timeframe)


def _alp_to_lwc(timeframe: TimeFrame) -> fta.TF:
    period = alpaca_to_lwc_map[timeframe.unit]
    if period == "M" and timeframe.amount == 12:
        # Special case
        return fta.TF(1, "Y")

    return fta.TF(timeframe.amount, period)


def _lwc_to_alp(timeframe: fta.TF) -> TimeFrame:
    if timeframe.toStr == "1Y":
        # Special case
        return TimeFrame(12, TimeFrameUnit.Month)
    else:
        if (period := lwc_to_alpaca_map[timeframe.period]) is not None:
            return TimeFrame(timeframe.mult, period)
        else:
            log.warning("Period '%s' is not supported. Defaulting to 1 Day.")

        return TimeFrame(1, TimeFrameUnit.Day)


# endregion
