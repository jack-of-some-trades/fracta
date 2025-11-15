"""Python Classes that are analogs of, and control, the Main Window Components"""

from __future__ import annotations
from abc import abstractmethod, ABC
from enum import IntEnum, auto
import logging
import asyncio
import multiprocessing as mp
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from typing import TYPE_CHECKING, Callable, Literal, Optional, Protocol

from . import util, indicators, broker_apis

from .events import Events
from .js_cmd import JS_CMD
from .py_cmd import WIN_CMD_ROLODEX
from .js_window import PyWv, MpHooks, PyWebViewOptions
from .types import JS_Color, TF

if TYPE_CHECKING:
    from .charting.series_dtypes import SeriesType

log = logging.getLogger("fracta_log")
APIs = Literal["psyscale", "alpaca"]


# pylint: disable=missing-class-docstring, missing-function-docstring, import-outside-toplevel
class BrokerAPI(Protocol):
    def setup_window(self, window: "Window"): ...


class FrameTypes(IntEnum):
    """
    Enum to define implemented subclasses of Frame.
    This must match the Const Object Definition in container.ts
    """

    ABSTRACT = auto()
    CHART = auto()


class Layouts(IntEnum):
    "1:1 Mapping of layout.ts Container_Layouts Enum"

    SINGLE = 0
    DOUBLE_VERT = auto()
    DOUBLE_HORIZ = auto()
    TRIPLE_VERT = auto()
    TRIPLE_VERT_LEFT = auto()
    TRIPLE_VERT_RIGHT = auto()
    TRIPLE_HORIZ = auto()
    TRIPLE_HORIZ_TOP = auto()
    TRIPLE_HORIZ_BOTTOM = auto()
    QUAD_SQ_V = auto()
    QUAD_SQ_H = auto()
    QUAD_VERT = auto()
    QUAD_HORIZ = auto()
    QUAD_LEFT = auto()
    QUAD_RIGHT = auto()
    QUAD_TOP = auto()
    QUAD_BOTTOM = auto()

    @property
    def num_frames(self) -> int:
        "Function that returns the number of Frames this layout contains"
        if self.name.startswith("SINGLE"):
            return 1
        elif self.name.startswith("DOUBLE"):
            return 2
        elif self.name.startswith("TRIPLE"):
            return 3
        elif self.name.startswith("QUAD"):
            return 4
        else:
            return 0


class Window:
    "Window is an object that creates & Parses Commands from the Javascript Webview"

    def __init__(
        self,
        *,
        daemon: bool = True,
        use_calendars: bool = True,
        broker_api: Optional[APIs | BrokerAPI] = None,
        log_level: Optional[logging._Level] = None,
        options: Optional[PyWebViewOptions] = None,
        **kwargs,
    ) -> None:
        # -------- Setup and start the Pywebview subprocess  -------- #
        if options is not None:
            # PyWebviewOptions Given, overwrite anything in kwargs.
            kwargs = asdict(options)

        if log_level is not None:
            log.setLevel(log_level)
            kwargs["log_level"] = log_level
        elif "debug" in kwargs.keys() and kwargs["debug"]:
            log.setLevel(logging.DEBUG)

        # create and then unpack the hooks directly into class variables
        mp_hooks = MpHooks()
        self._fwd_queue = mp_hooks.fwd_queue
        self._rtn_queue = mp_hooks.rtn_queue
        self._stop_event = mp_hooks.stop_event
        self._js_loaded_event = mp_hooks.js_loaded_event

        kwargs["mp_hooks"] = mp_hooks  # Pass the hooks along to PyWv
        self._view_process = mp.Process(target=PyWv, kwargs=kwargs, daemon=daemon)
        self._view_process.start()

        if use_calendars:
            # Enable Calendars after Sub-process Launch so the module isn't loaded by that process.
            # TODO: Always use calendars? it might be optimized enough now that it might as well be used.
            indicators.timeseries.enable_market_calendars()

        # Wait for PyWebview to load before continuing
        # js_loaded_event set in PyWv._assign_callbacks()
        if not self._js_loaded_event.wait(timeout=10):
            raise TimeoutError("Failed to load PyWebView in a reasonable amount of time.")

        # Begin Listening for any responses from PyWV Process
        self._queue_manager = asyncio.create_task(self._manage_queue())

        # -------- Create & Setup Standard Events  -------- #
        self.events = Events(self)
        indicators.timeseries.setup_window_events(self)

        # Using ID_List over ID_Dict so element order is mutable for PY_CMD.REORDER_CONTAINERS
        self._container_ids = util.ID_List("c")
        self.containers: list[Container] = []

        # -------- Create & Setup Data Broker  -------- #
        if broker_api is None:
            self.broker_api = None
            return
        if not isinstance(broker_api, str):
            self.broker_api = broker_api
            broker_api.setup_window(self)
            return

        if broker_api == "alpaca":
            self.broker_api = broker_apis.AlpacaAPI()
            self.broker_api.setup_window(self)
        elif broker_api == "psyscale":
            self.broker_api = broker_apis.PsyscaleAPI()
            self.broker_api.setup_window(self)
        else:
            log.warning('Unknown Broker API: "%s"', broker_api)

    async def _manage_queue(self):
        log.debug("Entered Async Queue Manager")
        async_loop = asyncio.get_event_loop()

        with ThreadPoolExecutor(max_workers=1) as pool:
            while not self._stop_event.is_set():
                cmd, *args = await async_loop.run_in_executor(pool, self._rtn_queue.get)
                WIN_CMD_ROLODEX[cmd](self, *args)
                log.debug("PY_CMD: %s: %s", cmd.name, str(args))

        log.debug("Exited Async Queue Manager")

    # region ------------------------ Public Window Methods  ------------------------ #

    def show(self):
        "Show the View Window"
        self._fwd_queue.put((JS_CMD.SHOW,))

    def hide(self):
        "Hide the View Window"
        self._fwd_queue.put((JS_CMD.HIDE,))

    def maximize(self):
        "Hide the View Window"
        self._fwd_queue.put((JS_CMD.MAXIMIZE,))

    def minimize(self):
        "Hide the View Window"
        self._fwd_queue.put((JS_CMD.MINIMIZE,))

    def restore(self):
        "Hide the View Window"
        self._fwd_queue.put((JS_CMD.RESTORE,))

    def close(self):
        "Hide the View Window"
        self._fwd_queue.put((JS_CMD.CLOSE,))

    async def await_close(self):
        "Await closure of the window's asyncio loop. (Window Closure)"
        await self._queue_manager

        # Await Shutdown of Broker API if shutdown routine exists
        shutdown_attr = getattr(self.broker_api, "shutdown", None)
        if shutdown_attr is None:
            return
        elif asyncio.iscoroutinefunction(shutdown_attr):
            await shutdown_attr()
        elif isinstance(shutdown_attr, Callable):
            shutdown_attr()

    def load_css(self, filepath: str):
        "Pass a .css file's absolute filepath to the window to load it"
        self._fwd_queue.put((JS_CMD.LOAD_CSS, filepath))

    def set_user_colors(self, opts: list[JS_Color]):
        "Set the User Defined Colors available in the Color Picker"
        self._fwd_queue.put((JS_CMD.SET_USER_COLORS, opts))

    def new_tab(self) -> Container:
        "Add a new Tab. A reference to the new Container is returned"
        new_id = self._container_ids.generate_id()
        new_container = Container(new_id, self._fwd_queue, self)
        self.containers.append(new_container)
        return new_container

    def del_tab(self, _id: str | int):
        "Deletes a Tab. Id can be either the js_id or tab #."
        container = self.get_container(_id)
        ids = container.all_ids()

        # Be sure to allow frames to clear up any assets before parent objs are deleted
        # This ensures web-sockets and other assets are closed.
        for frame in container.frames.values():
            del frame

        # Remove the Objects from local storage and erase their JS global references
        self._container_ids.remove(container.js_id)
        self.containers.remove(container)
        self._fwd_queue.put((JS_CMD.REMOVE_CONTAINER, container.js_id))
        self._fwd_queue.put((JS_CMD.REMOVE_REFERENCE, *ids))

    def get_container(self, _id: int | str) -> Container:
        "Return the container that matches either the given js_id, or the tab #"
        if isinstance(_id, str):
            for container in self.containers:
                if _id == container.js_id:
                    return container
            raise IndexError(f"Window doesn't have a Container with ID:{_id}")
        else:
            if 0 <= _id < len(self.containers):
                return self.containers[_id]
            raise IndexError(f"Container index {_id} out of bounds.")

    def set_search_filters(
        self,
        category: Literal["asset_class", "source", "exchange"],
        items: list[str],
    ):
        "Set the available search filters in the symbol search menu."
        self._fwd_queue.put((JS_CMD.SET_SYMBOL_SEARCH_OPTS, category, items))

    def set_layout_favs(self, favs: list[Layouts]):
        "Set the layout types shown on the Window's TopBar"
        self._fwd_queue.put((JS_CMD.UPDATE_LAYOUT_FAVS, {"favorites": favs}))

    def set_series_favs(self, favs: list["SeriesType"]):
        "Set the Series types shown on the Window's TopBar"
        self._fwd_queue.put((JS_CMD.UPDATE_SERIES_FAVS, {"favorites": favs}))

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
        self._fwd_queue.put((JS_CMD.UPDATE_TF_OPTS, json_dict))

    # endregion


class Container:
    "A Container Class instance manages the all sub frames and the layout that contains them."

    def __init__(self, _js_id: str, fwd_queue: mp.Queue, window: Window) -> None:
        self._fwd_queue = fwd_queue
        self._window = window
        self._js_id = _js_id
        self._layout = Layouts.SINGLE
        self.frames = util.ID_Dict[Frame](f"{_js_id}_f")

        self._fwd_queue.put((JS_CMD.ADD_CONTAINER, self._js_id))
        self.set_layout(self._layout)  # Adds First Frame

    def __del__(self):
        log.debug("Deleteing Container: %s", self._js_id)

    @property
    def js_id(self) -> str:
        "Immutable Copy of the Object's Javascript_ID"
        return self._js_id

    def add_frame(self, _js_id: Optional[str] = None, _type: FrameTypes = FrameTypes.CHART) -> Frame:
        "Creates a new Frame. Frame will only be displayed once the layout supports a new frame."
        frame_cls = FRAME_OBJ_MAP.get(_type, None)
        if frame_cls is not None:
            return frame_cls(parent=self, _js_id=_js_id)
        raise TypeError(f"Cannot Initilize an Frame Type {_type}")

    def set_layout(self, layout: Layouts | int):
        "Set the layout of the Container creating Frames as needed"
        layout = Layouts(layout)
        # If there arent enough Frames to support the layout then generate them
        frame_diff = len(self.frames) - layout.num_frames
        if frame_diff < 0:
            for _ in range(-frame_diff):
                log.debug("Add Frame")
                self.add_frame()

        self._fwd_queue.put((JS_CMD.SET_LAYOUT, self._js_id, layout))
        self._layout = layout

    def all_ids(self) -> list[str]:
        "Return a List of all Ids of this object and sub-objects"
        _ids = [self._js_id]
        for _, frame in self.frames.items():
            _ids += frame.all_ids()
        return _ids

    def remove_frame(self, frame_id: str):
        "Delete a frame given the frame's js_id if the container has more frames than needed"
        if frame_id not in self.frames or len(self.frames) <= self._layout.num_frames:
            return

        frame = self.frames.pop(frame_id)
        frame_ids = frame.all_ids()
        del frame

        self._fwd_queue.put((JS_CMD.REMOVE_FRAME, self._js_id, frame_id))
        self._fwd_queue.put((JS_CMD.REMOVE_REFERENCE, *frame_ids))


class Frame(ABC):
    """
    Abstract Class that represents one segment of a Container's Layout. This class can be inherited
    from to create different types of displays that natively work with the layout configurations
    and resize functionality.

    Currently this is only inherited by a Charting_Frame, but in the future could be inherited by
    other useful tools such as Broker integration, Bid/Ask Tables, Stock Screeners, Sky's the limit
    """

    Frame_Type = FrameTypes.ABSTRACT

    def __init__(self, parent: Container, _js_id: Optional[str] = None) -> None:
        if _js_id is None:
            self._js_id = parent.frames.generate_id(self)
        else:
            self._js_id = parent.frames.affix_id(_js_id, self)

        self._window = parent._window
        self._fwd_queue = parent._fwd_queue

        self._fwd_queue.put((JS_CMD.ADD_FRAME, parent._js_id, self._js_id, self.Frame_Type))

    @property
    def js_id(self) -> str:
        "Immutable Copy of the Object's Javascript_ID"
        return self._js_id

    @abstractmethod
    def all_ids(self) -> list[str]:
        "Returns a List of all JS Ids this obj (and Sub-objs) placed into the JS Global namespace"

    @abstractmethod
    def __del__(self):
        "Ensure Clean up of all interally created objects."


# EoF Imports to prevent an import error.
# Future_Annotations Silence the Typing errors that would occur above.
# pylint: disable=wrong-import-position
from .charting.charting_frame import ChartingFrame

FRAME_OBJ_MAP: dict[FrameTypes, type[Frame]] = {
    FrameTypes.CHART: ChartingFrame,
}
