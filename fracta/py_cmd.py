"""
Implementations of Functions, invoked by Rtn_Queue Packets, that preform an action on the Window
All Functions have been rolled-up into WIN_CMD_ROLODEX that Maps {PY_CMD: Function}
"""

import logging
from enum import IntEnum, auto
from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    from .py_window import Window

# @pylint: disable=invalid-name, missing-function-docstring, protected-access

log = logging.getLogger("fracta_log")


class PY_CMD(IntEnum):
    "Enumeration of the various commands that javascript can send to python"

    ADD_CONTAINER = auto()
    REMOVE_CONTAINER = auto()
    REORDER_CONTAINERS = auto()
    REMOVE_FRAME = auto()
    # ADD_PANE = auto() # TBI
    # REMOVE_PANE = auto() # TBI

    SYMBOL_SEARCH = auto()
    SYMBOL_SELECT = auto()

    TIMESERIES_REQUEST = auto()
    INDICATOR_REQUEST = auto()
    # RANGE_CHANGE = auto() # Maybe?
    SERIES_CHANGE = auto()
    LAYOUT_CHANGE = auto()
    ADD_INDICATOR = auto()
    SET_INDICATOR_OPTS = auto()
    UPDATE_SERIES_OPTS = auto()

    ADD_PRIMITIVE = auto()
    REMOVE_PRIMITIVE = auto()
    UPDATE_PRIMITIVE_OPTS = auto()


# Queues are spawned 1 per window, but don't have reference to that window. 1st arg must always provide that reference.
class PY_CMD_FUNC(Protocol):
    def __call__(self, window: "Window", *args: Any, **kwds: Any): ...


WIN_CMD_ROLODEX: dict[PY_CMD, PY_CMD_FUNC] = {}


def register_py_cmd(cmd: PY_CMD):
    def decorator(func: PY_CMD_FUNC) -> PY_CMD_FUNC:
        WIN_CMD_ROLODEX[cmd] = func
        return func

    return decorator


# region --------------------- Return Queue CMD Rolodex --------------------- #
# Strict Typing has been relaxed since these are only invoked by formatted Rtn_Queue Packets


@register_py_cmd(PY_CMD.SYMBOL_SEARCH)
def symbol_search(window: "Window", *args):
    # Should be done by keyword since the Emitter Protocol Signature allows either
    # individual args or packing filtering info into **kwargs
    window.events.symbol_search(
        symbol=args[0],
        sources=args[1],
        exchanges=args[2],
        asset_classes=args[3],
        confirmed=args[4],
    )


@register_py_cmd(PY_CMD.ADD_CONTAINER)
def add_container(window: "Window"):
    window.new_tab()


@register_py_cmd(PY_CMD.REMOVE_CONTAINER)
def remove_container(window: "Window", c_id):
    window.del_tab(c_id)


@register_py_cmd(PY_CMD.REMOVE_FRAME)
def remove_frame(window: "Window", c_id, f_id):
    window.container(c_id).remove_frame(f_id)


@register_py_cmd(PY_CMD.REORDER_CONTAINERS)
def reorder_containers(window: "Window", _from: str | int, _to: str | int):
    # This keeps the Window Obj Tab order identical to what is displayed
    window._containers.reorder(_from, _to)
