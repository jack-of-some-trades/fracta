"Python Object Representations of Primitive HTML Canvas drawing objects"

from __future__ import annotations
from copy import deepcopy
from weakref import ref
from abc import ABCMeta
from logging import getLogger
from dataclasses import asdict, dataclass
from typing import Any, ClassVar, Optional, TYPE_CHECKING, Protocol, Type

from fracta.charting.series_dtypes import Point
from fracta.charting.series_options import (
    CanvasLineCap,
    CanvasLineJoin,
    CanvasTextAlign,
    CanvasTextBaseline,
    LineStyleEXT,
)

from ..js_cmd import JS_CMD
from ..types import Color

if TYPE_CHECKING:
    from .indicator import Indicator

# pylint: disable=invalid-name
logger = getLogger("fracta_log")


class OptsSyncIntercept(Protocol):
    def __call__(self, opts: dict[str, Any]) -> Optional[dict[str, Any]]: ...


def bootstrap_dataclass[T: "PrimitiveOptions"](cls: type[T]) -> type[T]:
    "Decorator to make a dataclass and bootstrap the dataclass __fields__ property."
    cls = dataclass(cls)
    cls.__fields__ = set(getattr(cls, "__dataclass_fields__", {}).keys()) - {"__fields__"}
    return cls


# region ---- ---- ---- ---- Primitive and Primitive Options Base classes ---- ---- ---- ----


@dataclass
class PrimitiveOptions(metaclass=ABCMeta):
    """
    Base Options Data-Class that all primitives inherit from and expand on.
    All Arguments of all subclasses should have a default value. It can be something
    other than Optional[T] = None such as Bool = False, but there must be a default.

    For Python generated primitives, tangible defaults to False so Primitives
    can't be manually edited via the UI. If this is desired set to True.
    """

    __fields__: ClassVar[set[str]] = set()
    visible: Optional[bool] = None
    tangible: Optional[bool] = False
    autoscale: Optional[bool] = False

    def __getitem__(self, name: str) -> Any:
        if name not in self.__fields__:
            raise AttributeError(f'Cannot get "{name}", {self.__class__.__name__} does not have a "{name}" attribute.')
        return getattr(self, name)

    def __setitem__(self, name: str, value: Any) -> None:
        if name not in self.__fields__:
            raise AttributeError(f'Cannot set "{name}", {self.__class__.__name__} does not have a "{name}" attribute.')
        setattr(self, name, value)

    def apply_options(self, opts: dict[str, Any]):
        "Update options given a set of key, value pairs. Only valid keys are added"
        for k in self.__fields__.intersection(opts.keys()):
            setattr(self, k, opts[k])


class PrimitiveBase[T: PrimitiveOptions]:
    "Base Class for Charting Primitives."

    def __init_subclass__(cls) -> None:
        super().__init_subclass__()

        # Retrieve a reference to the options dataclass from the provided baseclass signature
        for base_cls in getattr(cls, "__orig_bases__", ()):
            if len(base_cls.__args__) == 0:
                continue
            arg_type = base_cls.__args__[0]
            if isinstance(arg_type, Type) and issubclass(arg_type, PrimitiveOptions):
                cls.__options_cls__ = arg_type

        if not hasattr(cls, "__options_cls__"):
            raise AttributeError("Could not Determine Options Class Type for Primitive Sub-Class.")

    def __init__(
        self,
        parent: "Indicator",  # TODO: Change to Indicator & PrimitiveGroup?
        opts: Optional[T] = None,
        js_id: Optional[str] = None,
    ) -> None:

        # Ensure a default options cls is always constructed.
        self._opts: T = opts if opts is not None else self.__options_cls__()  # type:ignore
        self.__opts_sync_intercept__: OptsSyncIntercept | None = None
        self.__init_state__ = asdict(self._opts)

        # Make _primitives a Weakref since this is a child obj.
        self._parent_primitives = ref(parent._primitives)

        # TODO: Scratch out parent._primitves and make it parent.parent_frame._primitves &
        # Then create a copy in parent._primitives? it would ensure distinct Ids.
        if js_id is None:
            self._js_id = parent._primitives.generate_id(self)
        else:
            self._js_id = parent._primitives.affix_id(js_id, self)

        self._ids = *parent._ids, self._js_id
        self._fwd_queue = parent._fwd_queue

        self._fwd_queue.put((JS_CMD.ADD_PRIMITIVE, *self._ids, self.__class__.__name__, self._opts))

    def __del__(self):
        logger.debug("Deleteing %s: %s", self.__class__.__name__, self._js_id)

    def reset(self):
        "Reset the state back to how it existed at the time initialization"
        self.apply_options(self.__init_state__)

    def delete(self):
        "Remove the Object from the screen"
        if (parent_dict := self._parent_primitives()) is not None:
            parent_dict.pop(self._js_id)  # Ensure all references are gone
        self._fwd_queue.put((JS_CMD.REMOVE_PRIMITIVE, *self._ids))

    def __setattr__(self, name: str, value: Any) -> None:
        if name not in self.__options_cls__.__fields__:
            return super().__setattr__(name, value)

        # Handle _opts specific fields.
        self._opts[name] = value  # Will error if invalid property.
        self._fwd_queue.put(  # Immediately pass the update to the window.
            (JS_CMD.UPDATE_PRIMITIVE_OPTS, *self._ids, {name: value})
        )

    def __getattr__(self, name: str) -> None:
        if name in self.__options_cls__.__fields__:
            return self._opts[name]

        return object.__getattribute__(self, name)

    def assign_opts_sync_hander(self, handler: OptsSyncIntercept | None = None):
        """
        Assign a user-defined function to intercept changes to this primitive's options that were made via the UI.

        This function is called with only the changed options, and is called just before the Primitive's
        internal options dataclass is updated. This allows for comparisons between old and new states to
        be performed prior to updating the primitive.

        Returning None updates the internal options as normal synchronizing the Primitive to the changes
        made in the UI. Returning a Dict updates only the returned keys to the values provided essentially
        overwriting the user's input.
        """
        self.__opts_sync_intercept__ = handler

    @property
    def options(self) -> T:
        "The full set of options that describe the primitive's current state"
        return deepcopy(self._opts)

    def apply_options(self, opts: dict[str, Any] | T):
        "Apply the given set of options to a primitive. Best used when updating multiple params at once."
        self._opts.apply_options(opts)
        self._fwd_queue.put((JS_CMD.UPDATE_PRIMITIVE_OPTS, *self._ids, self._opts))

    def __sync_options__(self, opts: dict[str, Any]):
        "Hook for UI Inputs to sync the changed options back to python"
        if self.__opts_sync_intercept__ is not None:
            opts_rtn = self.__opts_sync_intercept__(opts)
            opts = opts if opts_rtn is None else opts_rtn

        self._opts.apply_options(opts)


# endregion

# region ---- ---- ---- ---- Basic Primitive Options ---- ---- ---- ----

@dataclass
class CanvasStrokeStyles:
    "Canvas Style Options for drawing lines"

    width: Optional[float] = None
    lineColor: Optional[Color] = None
    lineStyle: Optional[LineStyleEXT] = None
    lineCap: Optional[CanvasLineCap] = None
    lineJoin: Optional[CanvasLineJoin] = None


@dataclass
class CanvasTextStyles:
    "Canvas Style Options for drawing lines"

    font: Optional[str] = None
    fontSize: Optional[int] = None
    textAlign: Optional[CanvasTextAlign] = None
    textBaseline: Optional[CanvasTextBaseline] = None


# endregion

# region ---- ---- ---- ---- Two-Point Primitives & Primitive Options ---- ---- ---- ----


@bootstrap_dataclass
class TwoPointOptions(PrimitiveOptions):
    "Parameters for primitives defined by two points on a chart."

    p1: Optional[Point] = None
    p2: Optional[Point] = None


@bootstrap_dataclass
class TrendlineOptions(TwoPointOptions, CanvasStrokeStyles, CanvasTextStyles):
    "Data & Style Options for a Trendline Primitive"


class TrendLine(PrimitiveBase[TrendlineOptions]):
    "Trendline Primitive"


# endregion
