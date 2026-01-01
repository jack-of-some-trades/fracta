from __future__ import annotations

from abc import ABC, abstractmethod
import logging
from typing import TYPE_CHECKING, Optional

from fracta.py_window import FrontendObject

from ..js_cmd import JS_CMD
from ..util import ID_Dict
from . import primitive as pr

if TYPE_CHECKING:
    from . import ChartingFrame, Indicator

log = logging.getLogger("fracta_log")


class PrimitiveSet(pr.PrimitiveHolder, FrontendObject["ChartingFrame | Indicator"]):
    "A collection of Primitives that share a common seriesAPI parent object"

    __special_id__ = "default_pset"

    def __init__(
        self,
        parent: "ChartingFrame | Indicator",
        name: Optional[str] = None,
        pane_index: int = 0,
        js_id: Optional[str] = None,
    ):
        pr.PrimitiveHolder.__init__(self)
        FrontendObject.__init__(self, parent, parent._associate_primitive_set(self, js_id))
        self._pane_index = pane_index
        self._name = name

        self._primitives = ID_Dict[pr.PrimitiveBase]("p")
        self.fwd_queue.put((JS_CMD.ADD_PRIMITIVE_SET, *self.ids, name, pane_index))

    def __del__(self):
        log.debug("Deleteing %s: %s", self.__class__.__name__, self.js_id)

    def __contains__(self, item: str | int) -> bool:
        "Check if the given primitive js_id or index # is in the collection"
        return item in self._primitives

    def AttachPrimitive(self, primitive: pr.PrimitiveBase):
        "Attach a primitive to this PrimitiveSet"
        # TODO: Fix improper handling of primitive private variables once ID update method is known.
        primitive._js_id = self._associate_primitive(primitive)
        self.fwd_queue.put((JS_CMD.ADD_PRIMITIVE, *primitive.ids, primitive._type, primitive._opts))

    def DetachPrimitive(self, primitive: pr.PrimitiveBase):
        "Detach a primitive from this PrimitiveSet"
        self._deassociate_primitive(primitive)
        self.fwd_queue.put((JS_CMD.REMOVE_PRIMITIVE, *primitive.ids))

    def MovePrimitive(self, primitive: pr.PrimitiveBase):
        "Move the given primitive from another holder to this one."
        raise NotImplementedError("MovePrimitive is not yet implemented for PrimitiveSet.")

    def reset(self):
        "Reset all internal primitives to their post-init state"
        for primitive in self._primitives.copy().values():
            primitive.reset()

    def delete(self):
        "Delete the Primitive Set and all of its children Primitives"
        for primitive in self._primitives.copy().values():
            primitive.delete()

        self.parent.delete_primitive_set(self)


class PrimitiveSetHolder(ABC):
    "Base functionality for objects that hold Primitive Sets, To be used as a Mixin for ChartingFrame & Indicators"

    def __init__(self) -> None:
        self._primitive_sets = ID_Dict[PrimitiveSet]("ps")

    def __contains__(self, item: str | int) -> bool:
        "Check if the given primitive set js_id or index # is in the collection"
        return item in self._primitive_sets

    def get_primitive_set(self, _id: str | int) -> PrimitiveSet:
        "Return the primitive set that matches either the given js_id, or the primitive set #"
        return self._primitive_sets[_id]

    @property
    def default_primitive_set(self) -> PrimitiveSet:
        "Lazily generated default Primitive Set"
        _pset = self._primitive_sets.get(self._primitive_sets.prefix + PrimitiveSet.__special_id__)
        return (
            _pset
            if _pset is not None
            else self.add_primitive_set(
                0, "Default Group", js_id=self._primitive_sets.prefix + PrimitiveSet.__special_id__
            )
        )

    @abstractmethod
    def add_primitive_set(
        self, pane_index: int = 0, name: Optional[str] = None, js_id: Optional[str] = None
    ) -> PrimitiveSet:
        "Request that a Primitive Set instance be added to this frame"

    @abstractmethod
    def delete_primitive_set(self, _ref: str | int | PrimitiveSet):
        "Request that a Primitive Set instance be deleted from this frame"

    def _associate_primitive_set(self, primitive_set: PrimitiveSet, js_id: Optional[str] = None) -> str:
        "Attach a Primitive Set to this Frame and return the JS ID it is stored under"
        if js_id is None:
            return self._primitive_sets.generate_id(primitive_set)
        else:
            return self._primitive_sets.affix_id(js_id, primitive_set)

    def _deassociate_primitive_set(self, _ref: str | int | PrimitiveSet):
        "Remove and Delete a Primitive Set"
        try:
            _id = _ref.js_id if isinstance(_ref, PrimitiveSet) else _ref
            self._primitive_sets.remove(_id)
        except (KeyError, IndexError):
            log.warning("Could not delete Primitive Set '%s'. It does not exist on '%s'", _id, self)

    def get_primitives_of_type[PT: pr.PrimitiveBase](self, _type: type[PT]) -> dict[str, PT]:
        "Returns a Dictionary of Primitives in the PrimitiveSets of this Object that are of the Given Type"
        primitives = {}
        for p_set in self._primitive_sets.values():
            primitives.update(p_set.get_primitives_of_type(_type))
        return primitives

    def delete_primitives_of_type[PT: pr.PrimitiveBase](self, _type: type[PT]):
        "Delete Primitives of a certain type from the PrimitiveSets of this Object"
        for p_set in self._primitive_sets.values():
            p_set.delete_primitives_of_type(_type)
