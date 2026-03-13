"""Python Classes that are analogs of, and control, the Main Window Components"""

from __future__ import annotations

import asyncio
import logging
from weakref import ref
from abc import abstractmethod
from enum import IntEnum, auto
from functools import cached_property
from typing import TYPE_CHECKING, ClassVar, Optional, Protocol, Self

from fastapi import WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState

from . import util
from .events import Events
from .js_cmd import JS_CMD

if TYPE_CHECKING:
    from .server import WindowManager
    from .charting.series_dtypes import SeriesType

log = logging.getLogger("fracta_log")


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

    # pylint: disable="missing-function-docstring"
    @cached_property
    def ids(self) -> dict[str, str]: ...
    @cached_property
    def queue(self) -> asyncio.Queue: ...
    @cached_property
    def events(self) -> Events: ...
    @property
    def window(self) -> "Window": ...


# pylint: disable="invalid-name"
class FrontendObject[ParentType: QueueHolder]:
    """
    Base class for objects that represent Frontend Objects
    Provides boiler plate functionality for the ID addressing system, and the ability interact with the window/frontend.
    The Generic type, ParentType, is used to define the type of object that the FrontendObject is a child of.
    """

    # The Key used in HTTP requests that hold the object addressing keys
    ID_KEY: ClassVar[str]

    def __init__(self, parent: ParentType, _js_id: str):
        self._js_id = _js_id
        self._parent = ref(parent)

    def __del__(self):
        log.debug("Deleteing %s, ID: %s", self.__class__.__name__, self.js_id)

    @property
    def js_id(self) -> str:
        "The Object's Javascript_ID"
        return self._js_id

    @cached_property
    def ids(self) -> dict[str, str]:
        "The Object's addressable ids"
        # del self.ids refreshes the cache after it's been set. (needs a 'suppress attribute error')
        return self.parent.ids | {self.ID_KEY: self._js_id}

    @cached_property
    def events(self) -> Events:
        "The Object's parent EventHub"
        return self.parent.events

    @cached_property
    def queue(self) -> asyncio.Queue:
        "The Object's Forward Queue"
        # Caching this is fine since the queue will be deleted when the frontend Objects all get collected.
        return self.window.queue

    ## Don't want to cache these. Doing so would cause circular referencing preventing collection
    @property
    def window(self) -> "Window":
        "The Object's parent Window"
        return self.parent.window

    @property
    def parent(self) -> ParentType:
        "The Object's parent object"
        parent = self._parent()
        if parent is None:
            raise ReferenceError("Reference to Parent Object has expired.")
        return parent

    def send(self, cmd: JS_CMD, /, *args, **kwargs):
        "Send a command to the Frontend, automatically appends the addressing IDs"
        if len(args) > 0:
            payload = self.ids | {"args": args} | kwargs
        else:
            payload = self.ids | kwargs
        self.queue.put_nowait((cmd, payload))


class Window:
    """
    TODO: Docstring

    TBD what this class actually does. It used to host the window, but that changed with the HTTP update.
    It the future it could manage the window's history and manage frontend recovery upon a reconnect.
    """

    ID_KEY: ClassVar[str] = "windowId"

    def __init__(self, window_manager: "WindowManager", js_id: Optional[str] = None):
        self._js_id = window_manager._associate_window(self, js_id)
        self._parent = ref(window_manager)
        self._stop_event = asyncio.Event()
        self._events = window_manager.events
        self._socket: Optional[WebSocket] = None
        self._containers = util.ID_Dict[Container]("c")
        self._queue: asyncio.Queue[tuple[JS_CMD, dict]] = asyncio.Queue()

        self._queue_manager = asyncio.create_task(self._manage_queue())
        self.new_tab()  # Init first container

    @property
    def js_id(self) -> str:
        "The Object's Javascript_ID"
        return self._js_id

    @cached_property
    def ids(self) -> dict[str, str]:
        "The Object's addressable ids"
        return {}  # {self.ID_KEY: self._js_id}

    @cached_property
    def queue(self) -> asyncio.Queue:
        "The Forward Queue to send commands to the Frontend"
        return self._queue

    @cached_property
    def events(self) -> Events:
        "The Object's EventHub"
        # Cached so the QueueHolder Inheritance protocol matches top to bottom.
        return self._events

    @property
    def window(self) -> Self:
        "The Window Object"
        return self

    @property
    def window_manager(self) -> "WindowManager":
        "The Object's parent object"
        parent = self._parent()
        if parent is None:
            raise ReferenceError("Reference to Parent Object has expired.")
        return parent

    async def refresh_socket(self, websocket: WebSocket):
        "Refresh the socket connection."
        if self._stop_event.is_set():
            raise RuntimeError(f"Attempting to reconnect to closed Window {self.js_id  = }.")
        if self._socket is not None and self._socket.client_state != WebSocketState.DISCONNECTED:
            await self._socket.close()

        await websocket.accept()
        self._socket = websocket

    async def _manage_queue(self):
        "Bridge the Synchrnonous Send commands with the Async Websocket Sender"
        while not self._stop_event.is_set():
            if self._socket is None:
                await asyncio.sleep(0.1)
            while self._socket is not None and not self._queue.empty():
                try:
                    if self._socket.client_state == WebSocketState.CONNECTED:
                        cmd, payload = await self._queue.get()
                        await self._socket.send_json({"cmd": cmd, "payload": payload})
                except (WebSocketDisconnect, RuntimeError, ConnectionResetError):
                    if self._socket.client_state == WebSocketState.CONNECTED:
                        await self._socket.close()
                    self._socket = None
                    self.window_manager.notify_disconnect(self)

        if self._socket is not None:
            await self._socket.close()

    def close(self):
        "Close out the window"
        for _, container in self._containers.items():
            container.remove()
        # After everything has a chance to place close out commands in the queue, shutdown the socket.
        self._stop_event.set()
        self._containers.clear()

    # region ------------------------ Public Window Methods  ------------------------ #

    ## TBD what this class actually does. It used to host the window, but that changed with the HTTP update.
    ## It the future it could manage the window's history and manage frontend recovery upon a reconnect?.

    def send(self, cmd: JS_CMD, /, *args, **kwargs):
        "Send a command to the Frontend, automatically appends the addressing IDs"
        if len(args) > 0:
            payload = self.ids | {"args": args} | kwargs
        else:
            payload = self.ids | kwargs
        return self.queue.put_nowait((cmd, payload))

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
        container.remove()

    def container(self, _id: int | str) -> Container:
        "Return the container that matches either the given js_id, or the tab #"
        # Really ins't necessary, could just make _containers public, but this keeps the ID_Dict scheme consistent
        return self._containers[_id]

    # endregion


class Container(FrontendObject[Window]):
    "A Container Class instance manages the all sub frames and the layout that contains them."

    ID_KEY: ClassVar[str] = "containerId"

    def __init__(self, window: Window, js_id: Optional[str] = None) -> None:
        super().__init__(window, window._associate_container(self, js_id))
        self._layout = Layouts.SINGLE
        self._frames = util.ID_Dict[Frame]("f")

        self.send(JS_CMD.ADD_CONTAINER)
        self.set_layout(self._layout)  # Adds First Frame

    def remove(self):
        "Remove this and sub-objects from the frontend."
        # TODO: Should I be making this object inoperable in this process? Would removing the ID_Dict ref be enough?
        self.send(JS_CMD.REMOVE_CONTAINER)
        self.send(JS_CMD.REMOVE_REFERENCE, ids=self.all_ids())

    def all_ids(self) -> list[str]:
        "Return a List of all Ids of this object and sub-objects that have been placed into the JS Global namespace"
        _ids = [self._js_id]
        for frame in self._frames.values():
            _ids = _ids + frame.all_ids()
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

        self.send(JS_CMD.SET_LAYOUT, layout=layout)
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
        frame.remove()

    def remove_all_frames(self):
        "Remove all frames from the container"
        for frame in self._frames.values():
            frame.remove()
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
    ID_KEY: ClassVar[str] = "frameId"

    def __init__(self, parent: Container, _js_id: Optional[str] = None) -> None:
        super().__init__(parent, parent._associate_frame(self, _js_id))
        self.send(JS_CMD.ADD_FRAME, frame_type=self.Frame_Type)

    def __init_subclass__(cls: type[Frame]) -> None:
        cls.Sub_Cls_Map[cls.Frame_Type] = cls
        return super().__init_subclass__()

    def remove(self):
        "Remove this and sub-objects from the frontend."
        # TODO: Should I be making this object inoperable in this process? Would removing the ID_Dict ref be enough?
        self.send(JS_CMD.REMOVE_FRAME)
        self.send(JS_CMD.REMOVE_REFERENCE, ids=self.all_ids())

    @abstractmethod
    def all_ids(self) -> list[str]:
        "Return a List of all Ids of this object and sub-objects that have been placed into the JS Global namespace"

    @abstractmethod
    def delete(self):
        "Ensure Clean up of all internally created objects."


# Bootstrapping with Typing.Self isn't ideal since calling
# ChartingFrame.Sub_Cls_Map[Abstract] would return ChartingFrame, not Frame.
Frame.Sub_Cls_Map = {FrameTypes.ABSTRACT: Frame}
