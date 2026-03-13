"Python Object Representations of Primitive HTML Canvas drawing objects"

from __future__ import annotations

from abc import ABCMeta, ABC, abstractmethod
from copy import deepcopy
from dataclasses import asdict, dataclass
from logging import getLogger
from typing import Any, ClassVar, Optional, Protocol, Type, TYPE_CHECKING

from ..types import Color
from ..util import ID_Dict
from ..js_cmd import JS_CMD

from .series_dtypes import Point
from .series_options import (
    CanvasLineCap,
    CanvasLineJoin,
    CanvasTextAlign,
    CanvasTextBaseline,
    LineStyleEXT,
)
from .. import window as win

if TYPE_CHECKING:
    from . import series_common as sc
    from . import primitive_set as ps
    from . import indicator as ind

# pylint: disable=invalid-name
logger = getLogger("fracta_log")


class OptsSyncIntercept(Protocol):
    def __call__(self, opts: dict[str, Any]) -> Optional[dict[str, Any]]: ...


# region ---- ---- ---- ---- Primitive and Primitive Options Base classes ---- ---- ---- ----


def bootstrap_dataclass[T: "PrimitiveOptions"](cls: type[T]) -> type[T]:
    "Decorator to make a dataclass and bootstrap the dataclass __fields__ property."
    cls = dataclass(cls)
    cls.__fields__ = set(getattr(cls, "__dataclass_fields__", {}).keys()) - {"__fields__"}
    return cls


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


class PrimitiveBase[T: PrimitiveOptions](win.FrontendObject["sc.SeriesCommon | ps.PrimitiveSet"]):
    "Base Class for Charting Primitives."

    ID_KEY: ClassVar[str] = "primitiveId"

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
        parent: "sc.SeriesCommon | ps.PrimitiveSet | ind.Indicator",
        opts: Optional[T] = None,
        js_id: Optional[str] = None,
    ) -> None:
        # Check if parent is an Indicator and resolve to its default PrimitiveSet.
        # Cannot use isinstance(parent, ind.Indicator) because it sends you to circular import hell.
        parent = getattr(parent, "default_primitive_set", None) or parent  # type: ignore
        super().__init__(parent, parent._associate_primitive(self, js_id))  # type: ignore

        # Ensure a default options cls is always constructed.
        self._opts: T = opts if opts is not None else self.__options_cls__()  # type:ignore
        self.__opts_sync_intercept__: OptsSyncIntercept | None = None
        self.__init_state__ = asdict(self._opts)
        self._type = self.__class__.__name__

        self.send(JS_CMD.CREATE_PRIMITIVE, self._type, self._opts)

    def reset(self):
        "Reset the state back to how it existed at the time initialization"
        self.apply_options(self.__init_state__)

    def remove(self):
        "Remove the primitive from the parent series/set"
        self.send(JS_CMD.REMOVE_PRIMITIVE)

    def delete(self):
        "Remove the Object from the screen"
        self.parent.detach_primitive(self)
        self.send(JS_CMD.REMOVE_PRIMITIVE)
        # TODO: determine a better function schemeing between delete & remove.

    def __setattr__(self, name: str, value: Any) -> None:
        if name not in self.__options_cls__.__fields__:
            return super().__setattr__(name, value)

        # Handle _opts specific fields.
        self._opts[name] = value  # Will error if invalid property.
        # Immediately pass the update to the window.
        self.send(JS_CMD.UPDATE_PRIMITIVE_OPTS, **{name: value})

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
        """
        Apply the given set of options to a primitive. Best used when updating multiple params at once.

        If a dataclass is provided, it will overwrite all options for those given.
        If a dict is provided, it will only update the keys that are given.
        """
        if isinstance(opts, dict):
            self._opts.apply_options(opts)
        else:
            self._opts = opts

        self.send(JS_CMD.UPDATE_PRIMITIVE_OPTS, self._opts)

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


# region ---- ---- ---- ---- PrimitiveHolder ---- ---- ---- ----


class PrimitiveHolder(ABC):
    """
    Base functionality for objects that hold Primitives.
    To be used as a Mixin for PrimitiveSet and SeriesCommon to reduce code duplication
    """

    def __init__(self):
        self._primitives = ID_Dict[PrimitiveBase]("p")

    def primitive(self, _id: str | int) -> PrimitiveBase:
        "Return the primitive that matches either the given js_id, or the primitive index #"
        return self._primitives[_id]

    def has_primitive(self, _id: str | int) -> bool:
        "Check if the primitive exists in the series"
        return _id in self._primitives

    def _associate_primitive(self, primitive: PrimitiveBase, js_id: Optional[str] = None) -> str:
        if js_id is None:
            return self._primitives.generate_id(primitive)
        else:
            return self._primitives.affix_id(js_id, primitive)

    def _deassociate_primitive(self, _ref: str | int | PrimitiveBase):
        try:
            _id = _ref.js_id if isinstance(_ref, PrimitiveBase) else _ref
            self._primitives.remove(_id)
        except (KeyError, IndexError):
            logger.warning(
                "Could not de-associate Primitive '%s'. It does not exist on PrimitiveHolder '%s'",
                _id,
                self,
            )

    @abstractmethod
    def attach_primitive(self, primitive: PrimitiveBase) -> None:
        "Attach a primitive to this object."

    @abstractmethod
    def detach_primitive(self, primitive: PrimitiveBase) -> None:
        "Detach a primitive from this object."

    @abstractmethod
    def move_primitive(self, primitive: PrimitiveBase) -> None:
        "Move an existing primitive from another object to this object."

    def get_primitives_of_type[PT: PrimitiveBase](self, _type: type[PT] = PrimitiveBase) -> ID_Dict[PT]:
        """
        Returns a Dictionary of Primitives owned by this indicator of the Given Type.
        If no argument is given, all of the Primitives will be returned.
        """
        if _type == PrimitiveBase:
            return self._primitives.copy()  # type: ignore
        rtn_dict = {}
        for _key, _primitive in self._primitives.items():
            if isinstance(_primitive, _type):
                rtn_dict[_key] = _primitive
        return rtn_dict  # type: ignore

    def delete_primitives_of_type[PT: PrimitiveBase](self, _type: type[PT] = PrimitiveBase):
        """
        Deletes all Primitives owned by this indicator of the given type.
        If no argument is given, all of the Primitives will be deleted.
        """
        for _primitive in self._primitives.copy().values():
            if isinstance(_primitive, _type):
                _primitive.delete()


# endregion
