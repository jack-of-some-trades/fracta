"""
FastAPI server module for fracta frontend communication.

Provides:
- WebSocketManager: Manages the lifecycle of the single long-lived WebSocket connections
- FractaServer: Class-based FastAPI application that inherits from FastAPI. Application specific FastAPI instance.
- send_command: Function to send JS_CMD commands to the frontend
"""

from functools import wraps
import logging
import os
import asyncio
import subprocess
import webbrowser
from contextlib import suppress
from os.path import abspath, dirname
from pathlib import Path
from typing import TYPE_CHECKING, Iterable, Literal, NotRequired, Optional, Protocol, Self, TypedDict, Any
from urllib.parse import urlparse
from dataclasses import dataclass, field
from itertools import chain

import uvicorn
from fastapi import APIRouter, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.websockets import WebSocketState

from fracta.charting import Indicator
from fracta.window import Layouts
from fracta.types import JS_Color, TF


from .events import Events
from . import Window, broker_apis, indicators, util, __description__, __version__
from .js_cmd import JS_CMD

if TYPE_CHECKING:
    from .charting.series_dtypes import SeriesType
    from .window import Layouts

# Static files path
FRONTEND_PATH = Path(dirname(abspath(__file__))) / "frontend"
APIs = Literal["psyscale", "alpaca"]

log = logging.getLogger("fracta_log")


def open_window_appmode(url: str) -> Optional[subprocess.Popen]:
    """
    Open the browser to the specified URL in app mode.

    Args:
        url: The URL to open
    """
    chrome_paths = [
        "chrome",
        "google-chrome",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]
    edge_paths = [
        "msedge",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]

    for browser_path in chrome_paths + edge_paths:
        try:
            return subprocess.Popen(
                [browser_path, f"--app={url}"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except (FileNotFoundError, OSError):
            continue


# pylint: disable=missing-class-docstring, missing-function-docstring, import-outside-toplevel
class SearchFilters(TypedDict):
    source: NotRequired[list[str]]
    exchange: NotRequired[list[str]]
    asset_class: NotRequired[list[str]]


class ServerProtocol(Protocol):
    @property
    def events(self) -> Events: ...

    def set_user_colors(self, opts: list[JS_Color]): ...
    def set_layout_favs(self, opts: list["Layouts"]): ...
    def set_series_favs(self, opts: list["SeriesType"]): ...
    def set_search_filters(self, filters: SearchFilters): ...
    def set_timeframes(self, favs: list[TF], opts: Optional[list[TF]] = None): ...


class BrokerAPI(Protocol):
    def setup_server(self, server: ServerProtocol): ...


@dataclass
class ServerParams:
    """Dataclass to derive and store Server Connection Parameters."""

    host: str = "127.0.0.1"
    port: int = 8000
    self_host: bool = True
    url: str = field(init=False)

    def __post_init__(self):
        """Format Params into formatted URL."""
        self.url = f"http://{self.host}:{self.port}"

    @property
    def is_local(self) -> bool:
        """Return true when connection points to a local host."""
        return self.host in {"localhost", "127.0.0.1", "::1"}

    @classmethod
    def from_url(cls, url: str, self_host: bool = True) -> Self:
        """Parses a connection URL into a ServerParams instance."""
        parsed = urlparse(url)

        if not parsed.hostname and not parsed.port:
            # Handle case where just "localhost:8000" is passed without scheme
            if ":" in url:
                parts = url.split(":")
                return cls(host=parts[0], port=int(parts[1]))
            return cls(host=url)

        return cls(
            host=parsed.hostname or "127.0.0.1",
            port=parsed.port or 8000,
            self_host=self_host,
        )

    @classmethod
    def from_env(cls) -> Self:
        """Return a ServerParams instance from environment variables."""
        return cls(
            host=os.getenv("FRACTA_HOST", "127.0.0.1"),
            port=int(os.getenv("FRACTA_PORT", "8000")),
            self_host=os.getenv("FRACTA_SELF_HOST", "false").lower() == "true",
        )


class WindowManager:
    """
    Manages the lifecycle of all windows, notably accepting and reconnecting websockets.
    This class manages all the required functions of a FractaServer. If
    """

    def __init__(self):
        self._events = Events()
        self._windows = util.ID_Dict("w")
        self._active_windows: list[Window] = []
        self._pending_windows: list[Window] = []
        self._disconnected_windows: list[Window] = []
        self.shutdown_event = asyncio.Event()
        self.app_process: list[subprocess.Popen] = []

        # Store State Commands that setup the window so they can be applied to new
        # windows without calling the respective functions each time.
        self.ui_state: dict[JS_CMD, Any] = {}
        self._populate_indicator_pkgs()

        indicators.timeseries.setup_events(self)
        indicators.timeseries.enable_market_calendars()
        # See note in Indicator._update_indicator_pkg_listing
        Indicator._update_indicator_pkg_listing = self._update_indicator_pkg

    def __del__(self):
        print("Terminating all processes")
        for proc in self.app_process:
            print(f"Terminating process {proc.pid}")
            proc.terminate()

    def _associate_window(self, window: Window, js_id: Optional[str] = None) -> str:
        "Associate a Window with this Window and return the JS ID it is stored under"
        if js_id is None:
            return self._windows.generate_id(window)
        else:
            return self._windows.affix_id(js_id, window)

    def _deassociate_window(self, _ref: str | int | Window):
        "Remove the window from this window's association dictionary"
        try:
            _id = _ref.js_id if isinstance(_ref, Window) else _ref
            self._windows.remove(_id)
        except (KeyError, IndexError):
            log.warning("Could not delete Window '%s'. It does not exist within the Server.", _ref)

    @property
    def events(self):
        # Just done to make this class follow the ServerProtocol
        return self._events

    @property
    def all_windows(self) -> Iterable[Window]:
        return chain(self._active_windows, self._pending_windows, self._disconnected_windows)

    def del_window(self, _id: str | int):
        "Deletes a Window. Id can be either the js_id or window #."
        window = self._windows.pop(_id)
        # Be sure to allow frames to clear up any assets before parent objs are deleted
        # This ensures web-sockets and other assets are closed.
        window.remove_all_containers()

    def window(self, _id: int | str) -> Window:
        "Return the window that matches either the given js_id, or the window #"
        # Really isn't necessary, could just make _windows public, but this keeps the ID_Dict scheme consistent
        return self._windows[_id]

    def _format_window(self, window: Window):
        "Format the given window with all the known desired UI states"
        for cmd, payload in self.ui_state.items():
            window.send(cmd, payload)

    def new_window(self, url: str, app_mode=True, js_id: Optional[str] = None) -> Window:
        "Open a new browser window."
        if app_mode:
            proc = open_window_appmode(url)
            app_mode = proc is not None
            if proc:
                self.app_process.append(proc)

        # Catch as a fallback in case app mode fails
        if not app_mode:
            webbrowser.open(url)

        window = Window(self, js_id)
        self._pending_windows.append(window)
        self._format_window(window)
        return window

    async def dock_socket(self, websocket: WebSocket):
        "Dock or reconnect a new websocket to the appropriate window."
        if len(self._pending_windows) > 0:
            window = self._pending_windows.pop(0)
        else:
            window = Window(self)
            self._format_window(window)

        await window.refresh_socket(websocket)
        self._active_windows.append(window)

    def notify_disconnect(self, window: Window):
        "Notify the manager that a window's socket has disconnected."
        self._active_windows.remove(window)
        self._disconnected_windows.append(window)

    def broadcast(self, cmd: JS_CMD, /, *args, **kwargs):
        "Send a formatted command to all windows"
        for win in self.all_windows:
            # Sending to all windows so the commands queue up even for pending/disconnected windows
            win.send(cmd, *args, **kwargs)

    def close_all(self):
        "Close all active WebSocket connections."
        for window in self.all_windows:
            window.close()

    # region -------- Persistent Window State Setters -------- #

    def set_search_filters(self, filters: SearchFilters):
        "Set the available search filters in the symbol search menu."
        self.ui_state[JS_CMD.SET_SYMBOL_SEARCH_OPTS] = self.ui_state.get(JS_CMD.SET_SYMBOL_SEARCH_OPTS, {}) | filters
        self.broadcast(
            JS_CMD.SET_SYMBOL_SEARCH_OPTS,
            self.ui_state[JS_CMD.SET_SYMBOL_SEARCH_OPTS],
        )

    def set_timeframes(self, favs: list[TF], opts: Optional[list[TF]] = None):
        "Set the Timeframes shown on the Window's TopBar and in the dropdown menu"
        menu_opts = {}
        if opts is not None:
            for fav in favs:
                if fav not in opts:
                    opts.append(fav)

            for option in opts:
                if option.period in menu_opts:
                    menu_opts[option.period] += [option.mult]
                else:
                    menu_opts[option.period] = [option.mult]
        else:
            menu_opts = {
                "s": [1, 2, 5, 15, 30],
                "m": [1, 2, 5, 15, 30],
                "h": [1, 2, 4],
                "D": [1],
                "W": [1],
            }
        json_dict = {
            "menu_listings": menu_opts,
            "favorites": [tf.toStr for tf in favs],
        }
        self.ui_state[JS_CMD.UPDATE_TF_FAVS] = json_dict
        self.broadcast(JS_CMD.UPDATE_TF_FAVS, json_dict)

    def set_user_colors(self, opts: list[JS_Color]):
        "Set the User Defined Colors available in the Color Picker"
        self.ui_state[JS_CMD.SET_USER_COLORS] = opts
        self.broadcast(JS_CMD.SET_USER_COLORS, opts)

    def set_layout_favs(self, opts: list["Layouts"]):
        "Set the layout types shown on the Window's TopBar"
        self.ui_state[JS_CMD.UPDATE_LAYOUT_FAVS] = opts
        self.broadcast(JS_CMD.UPDATE_LAYOUT_FAVS, opts)

    def set_series_favs(self, opts: list["SeriesType"]):
        "Set the Series types shown on the Window's TopBar"
        self.ui_state[JS_CMD.UPDATE_SERIES_FAVS] = opts
        self.broadcast(JS_CMD.UPDATE_SERIES_FAVS, opts)

    def _populate_indicator_pkgs(self):
        "Load all indicator metadata and send it to the window."
        self.ui_state[JS_CMD.POPULATE_IND_PKGS] = Indicator.__registered_indicators__
        self.broadcast(JS_CMD.POPULATE_IND_PKGS, self.ui_state[JS_CMD.POPULATE_IND_PKGS])

    def _update_indicator_pkg(self, pkg_key: str = "__user_indicators"):
        "Update the metadata for an indicator package"
        if pkg_key == "":
            self._populate_indicator_pkgs()
            return

        if pkg_key not in Indicator.__registered_indicators__:
            log.warning(
                "Cannot update indicator package metadata. Package key '%s' is unknown.",
                pkg_key,
            )
            return
        _updated_pkg_info = Indicator.__registered_indicators__[pkg_key]
        self.broadcast(JS_CMD.UPDATE_IND_PKG, pkg_key, _updated_pkg_info)
        # Update the ui_state to reflect the change before returning.
        self.ui_state[JS_CMD.POPULATE_IND_PKGS] |= {pkg_key: _updated_pkg_info}

    # endregion


class FractaServer:
    """
    Server for launching the fracta backend and, optionally, launching the frontend via open_window.
    Any additional kwargs are passed to the initializer of the internal FastAPI App instance.
    """

    def __init__(
        self,
        conn: Optional[ServerParams | str] = None,
        broker_api: Optional[APIs | BrokerAPI] = None,
        log_level: Optional[int | str] = None,
        **kwargs,
    ):
        # -------- Setup Logging -------- #
        if "debug" in kwargs and kwargs["debug"] and log_level is None:
            kwargs["log_level"] = logging.DEBUG

        kwargs.setdefault("log_level", log_level if log_level is not None else logging.INFO)
        log.setLevel(kwargs["log_level"])
        kwargs["log_level"] = log.level

        # -------- Create Server Sub-routine Managers -------- #
        self.window_manager = WindowManager()

        # -------- Create & Setup Data Broker -------- #
        if broker_api is None:
            self.broker_api = None
        elif not isinstance(broker_api, str):
            self.broker_api = broker_api
            broker_api.setup_server(self.window_manager)
        elif broker_api == "alpaca":
            self.broker_api = broker_apis.AlpacaAPI()
            self.broker_api.setup_server(self.window_manager)
        elif broker_api == "psyscale":
            self.broker_api = broker_apis.PsyscaleAPI()
            self.broker_api.setup_server(self.window_manager)
        else:
            log.warning('Unknown Broker API: "%s"', broker_api)

        # -------- Create & Setup Uvicorn Server -------- #
        if isinstance(conn, str):
            self._params = ServerParams.from_url(conn)
        elif conn is None:
            self._params = ServerParams.from_env()
        else:
            self._params = conn

        self.api = FractaAPI(**kwargs)
        self.api.state.window_manager = self.window_manager
        config = uvicorn.Config(
            self.api,
            host=self.params.host,
            port=self.params.port,
            log_level=kwargs["log_level"],
        )
        self.server = uvicorn.Server(config)

    @property
    def params(self) -> ServerParams:
        """Return the ServerParams instance."""
        return self._params

    def run(self):
        """Wrap uvicorn.Server.run."""
        self.server.run()

    async def serve(self):
        """Wrap uvicorn.Server.serve."""
        await self.server.serve()

    def new_window(self, app_mode=True) -> "Window":
        "Open a new browser window."
        return self.window_manager.new_window(self.params.url, app_mode)

    # region -------- Patch Properties & Methods -------- #
    # These are used to patch the Server class to make it act like a WindowManager
    @property
    def events(self) -> Events:
        """Return the Events instance."""
        # Patch Property so the Server can be used like a window manager
        return self.window_manager.events

    def set_search_filters(self, filters: SearchFilters):
        "Set the available search filters in the symbol search menu."
        self.window_manager.set_search_filters(filters)

    def set_timeframes(self, favs: list[TF], opts: Optional[list[TF]] = None):
        "Set the Timeframes shown on the Window's TopBar and in the dropdown menu"
        self.window_manager.set_timeframes(favs, opts)

    def set_user_colors(self, opts: list[JS_Color]):
        "Set the User Defined Colors available in the Color Picker"
        self.window_manager.set_user_colors(opts)

    def set_layout_favs(self, opts: list["Layouts"]):
        "Set the layout types shown on the Window's TopBar"
        self.window_manager.set_layout_favs(opts)

    def set_series_favs(self, opts: list["SeriesType"]):
        "Set the Series types shown on the Window's TopBar"
        self.window_manager.set_series_favs(opts)

    # endregion


root = APIRouter()
# root.mount("/assets", StaticFiles(directory=FRONTEND_PATH / "assets"), name="assets")


@root.get("/favicon.ico", include_in_schema=False)
@root.get("/favicon.png", include_in_schema=False)
async def favicon() -> FileResponse:
    """Serve the favicon."""
    return FileResponse(
        FRONTEND_PATH / "favicon.png",
        media_type="image/png",
        headers={"Cache-Control": "no-cache"},  # prevent caching during dev
    )


@root.get("/svg-defs.svg", include_in_schema=False)
async def svg_defs() -> FileResponse:
    """Serve the SVG defs file."""
    return FileResponse(
        FRONTEND_PATH / "svg-defs.svg",
        media_type="image/svg+xml",
        headers={"Cache-Control": "no-cache"},  # prevent caching during dev
    )


@root.get("/")
async def serve_index() -> FileResponse:
    """Serve the main HTML file."""
    index_path = FRONTEND_PATH / "index.html"
    return FileResponse(index_path, headers={"Cache-Control": "no-cache"})  # prevent caching during dev


@root.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for server-to-client communication."""
    manager = websocket.app.state.window_manager
    await manager.dock_socket(websocket)

    with suppress(WebSocketDisconnect):
        while not manager.shutdown_event.is_set() and websocket.application_state == WebSocketState.CONNECTED:
            await websocket.receive()  # Ignore all received messages.

    if websocket.application_state == WebSocketState.CONNECTED:
        await websocket.close()


class FractaAPI(FastAPI):

    @wraps(FastAPI.__init__)
    def __init__(self, **kwargs):
        kwargs.setdefault("title", "Fracta")
        kwargs.setdefault("description", __description__)
        kwargs.setdefault("version", __version__)

        super().__init__(**kwargs)
        self.mount("/assets", StaticFiles(directory=FRONTEND_PATH / "assets"), name="assets")
        self.include_router(root)
