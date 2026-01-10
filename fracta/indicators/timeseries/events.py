"Event Emitters for requests which are processed by the Timeseries Indicator."

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional, Protocol, TypeAlias

from ...events import Emitter
from ...js_cmd import JS_CMD

# pylint: disable = missing-function-docstring, missing-class-docstring, invalid-name, protected-access

if TYPE_CHECKING:
    from multiprocessing import Queue

    from pandas import DataFrame

    from ...py_window import Window
    from ...types import TF, Ticker
    from .timeseries import Timeseries


def setup_window_events(window: "Window"):
    "Setup a Fracta Window to support Timeseries Events"
    window.events.open_socket = Emitter[Socket_Open_Protocol]()
    window.events.close_socket = Emitter[Socket_Close_Protocol]()
    window.events.data_request = Emitter[Data_Request_Protocol](_timeseries_request_responder)
    window.events.symbol_search = Emitter[Symbol_Search_Protocol](
        _symbol_search_rsp,
        fwd_queue=window._fwd_queue,
    )


class Data_request_sync(Protocol):
    def __call__(self, ticker: Ticker, timeframe: TF) -> "DataFrame" | list[dict[str, Any]] | None: ...
class Data_request_async(Protocol):
    def __call__(self, ticker: Ticker, timeframe: TF) -> "DataFrame" | list[dict[str, Any]] | None: ...


def _timeseries_request_responder(data: "DataFrame" | list[dict[str, Any]] | None, series: Timeseries, **_):
    "Function that responds to the data returned by an Event.data_request event"
    if data is not None:
        series.set_data(data)


class Symbol_search_sync_1(Protocol):
    def __call__(self, symbol: str, **kwargs) -> Optional[list[Ticker]]: ...
class Symbol_search_sync_2(Protocol):
    def __call__(
        self,
        symbol: str,
        sources: list[str],
        exchanges: list[str],
        asset_classes: list[str],
        confirmed: bool,
    ) -> Optional[list[Ticker]]: ...
class Symbol_search_async_1(Protocol):
    async def __call__(self, symbol: str, **kwargs) -> Optional[list[Ticker]]: ...
class Symbol_search_async_2(Protocol):
    async def __call__(
        self,
        symbol: str,
        sources: list[str],
        exchanges: list[str],
        asset_classes: list[str],
        confirmed: bool,
    ) -> Optional[list[Ticker]]: ...


def _symbol_search_rsp(items: list[Ticker], *_, fwd_queue: "Queue"):
    "Window Symbol Search Response Function"
    fwd_queue.put((JS_CMD.SET_SYMBOL_ITEMS, items))


class Socket_Open_sync(Protocol):
    def __call__(self, ticker: Ticker, series: "Timeseries") -> None: ...
class Socket_Open_async(Protocol):
    async def __call__(self, ticker: Ticker, series: "Timeseries") -> None: ...


class Socket_Close_sync(Protocol):
    def __call__(self, series: "Timeseries") -> None: ...
class Socket_close_async(Protocol):
    async def __call__(self, series: "Timeseries") -> None: ...


Symbol_Search_Protocol: TypeAlias = (
    Symbol_search_sync_1 | Symbol_search_sync_2 | Symbol_search_async_1 | Symbol_search_async_2
)
Data_Request_Protocol: TypeAlias = Data_request_sync | Data_request_async
Socket_Open_Protocol: TypeAlias = Socket_Open_sync | Socket_Open_async
Socket_Close_Protocol: TypeAlias = Socket_Close_sync | Socket_close_async
