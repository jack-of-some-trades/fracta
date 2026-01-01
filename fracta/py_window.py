"""Python Classes that are analogs of, and control, the Main Window Components"""

from __future__ import annotations

import asyncio
import logging
import multiprocessing as mp
import queue
from abc import abstractmethod
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from enum import IntEnum, auto
from typing import TYPE_CHECKING, Callable, Literal, Optional, Protocol
from weakref import ref

from . import broker_apis, indicators, util
from .events import Events
from .js_cmd import JS_CMD
from .js_window import MpHooks, PyWebViewOptions, PyWv
from .py_cmd import WIN_CMD_ROLODEX
from .types import TF, JS_Color

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


class QueueHolder(Protocol):
    "Manager for the Forward and Return Queues"

    @property
    def ids(self) -> tuple[str, ...]: ...

    @property
    def fwd_queue(self) -> mp.Queue: ...

    @property
    def window(self) -> Window: ...


class FrontendObject[ParentType: QueueHolder]:
    "Base class for objects that represent Frontend Objects"

    def __init__(self, parent: ParentType, _js_id: str):
        self._js_id = _js_id
        self._parent = ref(parent)

    def __del__(self):
        log.debug("Deleteing %s, ID: %s", self.__class__.__name__, self.js_id)

    @property
    def js_id(self) -> str:
        "The Object's Javascript_ID"
        return self._js_id

    @property
    def ids(self) -> tuple[str, ...]:
        "The Object's addressable ids set"
        return (*self.parent.ids, self._js_id)

    @property
    def parent(self) -> ParentType:
        "The Object's parent object"
        parent = self._parent()
        if parent is None:
            raise ReferenceError("Reference to Parent Object has expired.")
        return parent

    @property
    def events(self) -> Events:
        "The Object's parent EventHub"
        return self.parent.window.events

    @property
    def window(self) -> Window:
        "The Object's parent Window"
        return self.parent.window

    @property
    def fwd_queue(self) -> mp.Queue:
        "The Object's Forward Queue to send commands to the Frontend"
        return self.parent.fwd_queue


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
            # Enable Calendars after Sub-process Launch so the module isn't loaded by the sub-process.
            # TODO: Always use calendars? it might be optimized enough now that it might as well be used.
            indicators.timeseries.enable_market_calendars()

        # Wait for PyWebview to load before continuing
        # js_loaded_event set in PyWv._assign_callbacks()
        if not self._js_loaded_event.wait(timeout=10):
            raise TimeoutError("Failed to load PyWebView in a reasonable amount of time.")

        # Begin Listening for any responses from PyWV Process
        self._queue_manager = asyncio.create_task(self._manage_rtn_queue())

        # -------- Create & Setup Standard Events  -------- #
        self.events = Events(self)
        indicators.timeseries.setup_window_events(self)

        self._containers = util.ID_Dict[Container]("c")

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

    async def _manage_rtn_queue(self):
        log.debug("Entered Async Queue Manager")
        async_loop = asyncio.get_event_loop()

        with ThreadPoolExecutor(max_workers=1) as pool:
            while not self._stop_event.is_set():
                try:
                    cmd, *args = await async_loop.run_in_executor(pool, self._rtn_queue.get, True, 0.2)
                    WIN_CMD_ROLODEX[cmd](self, *args)
                    log.debug("PY_CMD: %s: %s", cmd.name, str(args))
                except queue.Empty:
                    continue

        log.debug("Exited Async Queue Manager")

    @property
    def ids(self) -> tuple[str, ...]:
        "The Object's addressable ids set"
        return ()  # Maybe implement later when multiple windows are supported

    @property
    def fwd_queue(self) -> mp.Queue:
        "The Forward Queue to send commands to the Frontend"
        return self._fwd_queue

    @property
    def window(self) -> Window:
        return self

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
        self._fwd_queue.put((JS_CMD.UPDATE_TF_FAVS, json_dict))

    # endregion

    # region ------------------------ Public Container Methods  ------------------------ #

    def _associate_container(self, container: Container, js_id: Optional[str] = None) -> str:
        "Associate a Container with this Window and return the JS ID it is stored under"
        if js_id is None:
            return self._containers.generate_id(container)
        else:
            return self._containers.affix_id(js_id, container)

    def _deassociate_container(self, _ref: str | int | Container):
        "Remove the container from this window's association dictionary"
        try:
            _id = _ref.js_id if isinstance(_ref, Container) else _ref
            self._containers.remove(_id)
        except (KeyError, IndexError):
            log.warning("Could not delete Container '%s'. It does not exist on window", _ref)

    def new_tab(self, js_id: Optional[str] = None) -> Container:
        "Add a new Tab. A reference to the new Container is returned"
        return Container(self, js_id)

    def del_tab(self, _id: str | int):
        "Deletes a Tab. Id can be either the js_id or tab #."
        container = self._containers.pop(_id)
        # Be sure to allow frames to clear up any assets before parent objs are deleted
        # This ensures web-sockets and other assets are closed.
        container.remove_all_frames()

        # Command frontend to clear all global references to this container
        self._fwd_queue.put((JS_CMD.REMOVE_CONTAINER, container.js_id))
        self._fwd_queue.put((JS_CMD.REMOVE_REFERENCE, container.js_id))

    def container(self, _id: int | str) -> Container:
        "Return the container that matches either the given js_id, or the tab #"
        # Really ins't necessary, could just make _containers public, but this keeps the ID_Dict scheme consistent
        return self._containers[_id]

    # endregion


class Container(FrontendObject[Window]):
    "A Container Class instance manages the all sub frames and the layout that contains them."

    def __init__(self, window: Window, js_id: Optional[str] = None) -> None:
        super().__init__(window, window._associate_container(self, js_id))
        self._layout = Layouts.SINGLE
        self._frames = util.ID_Dict[Frame](f"{self._js_id}_f")

        self.fwd_queue.put((JS_CMD.ADD_CONTAINER, self._js_id))
        self.set_layout(self._layout)  # Adds First Frame0

    def all_ids(self) -> list[str]:
        "Return a List of all Ids of this object and sub-objects that have been placed into the JS Global namespace"
        _ids = [self._js_id]
        for frame in self._frames.values():
            _ids += frame.all_ids()
        return _ids

    def set_layout(self, layout: Layouts | int):
        "Set the layout of the Container creating Frames as needed"
        layout = Layouts(layout)
        # If there arent enough Frames to support the layout then generate them
        frame_diff = len(self._frames) - layout.num_frames
        if frame_diff < 0:
            for _ in range(-frame_diff):
                log.debug("Add Frame")
                self.add_frame()  # TODO : Populate with Generic, mutable, Frame

        self.fwd_queue.put((JS_CMD.SET_LAYOUT, self._js_id, layout))
        self._layout = layout

    # region ------------------------ Frame Methods  ------------------------

    def _associate_frame(self, frame: Frame, js_id: Optional[str] = None) -> str:
        "Associate a Frame with this Container and return the JS ID it is stored under"
        if js_id is None:
            return self._frames.generate_id(frame)
        else:
            return self._frames.affix_id(js_id, frame)

    def _deassociate_frame(self, _ref: str | int | Frame):
        "Remove the frame from this container's association dictionary"
        try:
            _id = _ref.js_id if isinstance(_ref, Frame) else _ref
            self._frames.remove(_id)
        except (KeyError, IndexError):
            log.warning("Could not delete Container '%s'. It does not exist on window", _ref)

    def reorder_frames(self, _from: str | int, _to: str | int):
        "Reorder the frames in this container"
        # TODO: Currently nothing calls this. Would need to set that up at a later time.
        self._frames.reorder(_from, _to)

    def frame(self, _ref: str | int) -> Frame:
        "Return the frame that matches either the given js_id, or the frame #"
        return self._frames[_ref]

    def add_frame(self, _js_id: Optional[str] = None, _type: FrameTypes = FrameTypes.CHART) -> Frame:
        "Creates a new Frame. Frame will only be displayed once the layout supports a new frame."
        frame_cls = Frame.Sub_Cls_Map.get(_type, None)
        if frame_cls is not None:
            return frame_cls(parent=self, _js_id=_js_id)
        raise TypeError(f"Cannot Initialize an Frame Type {_type}")

    def remove_frame(self, frame: str | int | Frame):
        "Delete a frame given the frame's js_id if the container has more frames than needed"
        frame_id = frame.js_id if isinstance(frame, Frame) else frame
        if frame_id not in self._frames or len(self._frames) <= self._layout.num_frames:
            return  # TODO : Change these later to allow removal of frames even when the layout doesn't support it

        frame = self._frames.pop(frame_id)
        self.fwd_queue.put((JS_CMD.REMOVE_FRAME, self._js_id, frame))
        self.fwd_queue.put((JS_CMD.REMOVE_REFERENCE, *frame.all_ids()))

    def remove_all_frames(self):
        "Remove all frames from the container"
        for frame in self._frames.values():
            self.fwd_queue.put((JS_CMD.REMOVE_FRAME, self._js_id, frame))
            self.fwd_queue.put((JS_CMD.REMOVE_REFERENCE, *frame.all_ids()))
        self._frames.clear()

    # endregion


class Frame(FrontendObject[Container]):
    """
    Abstract Class that represents one segment of a Container's Layout. This class can be inherited
    from to create different types of displays that natively work with the layout configurations
    and resize functionality.

    Currently this is only inherited by a Charting_Frame, but in the future could be inherited by
    other useful tools such as Broker integration, Bid/Ask Tables, Stock Screeners, Sky's the limit
    """

    Frame_Type = FrameTypes.ABSTRACT
    Sub_Cls_Map: dict[FrameTypes, type[Frame]] = {}

    def __init__(self, parent: Container, _js_id: Optional[str] = None) -> None:
        super().__init__(parent, parent._associate_frame(self, _js_id))
        self.fwd_queue.put((JS_CMD.ADD_FRAME, parent.js_id, self._js_id, self.Frame_Type))

    def __init_subclass__(cls: type[Frame]) -> None:
        cls.Sub_Cls_Map[cls.Frame_Type] = cls
        return super().__init_subclass__()

    def __del__(self):
        self.fwd_queue.put((JS_CMD.REMOVE_FRAME, self._js_id))
        self.fwd_queue.put((JS_CMD.REMOVE_REFERENCE, *self.all_ids()))
        super().__del__()

    @abstractmethod
    def all_ids(self) -> list[str]:
        "Return a List of all Ids of this object and sub-objects that have been placed into the JS Global namespace"

    @abstractmethod
    def delete(self):
        "Ensure Clean up of all internally created objects."


# Bootstrapping with Typing.Self isn't ideal since calling
# ChartingFrame.Sub_Cls_Map[Abstract] would return ChartingFrame, not Frame.
Frame.Sub_Cls_Map = {FrameTypes.ABSTRACT: Frame}
