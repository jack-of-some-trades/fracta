"""
Implementations of Command Functions that return formatted Javascript ready for execution
All Functions wave been rolled-up into VIEW_CMD_ROLODEX that Maps {JS_CMD: Function}
"""

from dataclasses import asdict, is_dataclass
from enum import Enum, IntEnum, auto
from json import JSONEncoder, dumps
from math import floor
from typing import Any

from pandas import DataFrame, Timestamp, notnull

from .types import Color

# @pylint: disable=invalid-name, line-too-long, missing-function-docstring


class FractaJSONEncoder(JSONEncoder):
    "Enhanced JSON Encoder that encodes various pycharts/pandas objects in JSON"

    def default(self, o):  # Order most Common to least commonly dumped
        if isinstance(o, Timestamp):
            return floor(o.timestamp())
        if is_dataclass(o):
            return asdict(  # Drop Nones
                o, dict_factory=lambda x: {k: v for (k, v) in x if v is not None}  # type: ignore
            )
        if isinstance(o, DataFrame):
            return [  # Drop NaNs & Nones (.to_json() leaves NaNs & Nones)
                {k: v for k, v in m.items() if notnull(v)} for m in o.to_dict(orient="records")
            ]
        if isinstance(o, Color):
            return repr(o)
        if isinstance(o, bool):
            return "true" if o else "false"
        if isinstance(o, Enum):
            return o.value
        return super().default(o)


def dump(obj: Any) -> str:
    "Enchanced JSON.dumps() to serialize all ORM Objects"
    return dumps(obj, cls=FractaJSONEncoder, separators=(",", ":"))


class JS_CMD(IntEnum):
    "Enumeration of the various commands that Python can send to Javascript"

    # Window Commands
    JS_CODE = 0
    ADD_CONTAINER = auto()
    REMOVE_CONTAINER = auto()
    REMOVE_REFERENCE = auto()
    UPDATE_TF_FAVS = auto()
    UPDATE_SERIES_FAVS = auto()
    UPDATE_LAYOUT_FAVS = auto()
    SET_SYMBOL_ITEMS = auto()
    SET_SYMBOL_SEARCH_OPTS = auto()
    SET_USER_COLORS = auto()

    # Container Commands
    SET_LAYOUT = auto()
    ADD_FRAME = auto()
    REMOVE_FRAME = auto()

    # Frame Commands
    ADD_PANE = auto()
    AUTOSCALE_TIME_AXIS = auto()
    SET_WHITESPACE_DATA = auto()
    CLEAR_WHITESPACE_DATA = auto()
    UPDATE_WHITESPACE_DATA = auto()
    SET_FRAME_SYMBOL = auto()
    SET_FRAME_TIMEFRAME = auto()
    SET_FRAME_SERIES_TYPE = auto()
    CREATE_INDICATOR = auto()
    REMOVE_INDICATOR = auto()

    # Pane Commands

    # Indicator Commands
    ADD_SERIES = auto()
    REMOVE_SERIES = auto()
    SET_LEGEND_LABEL = auto()
    SET_INDICATOR_MENU = auto()
    SET_INDICATOR_OPTIONS = auto()
    UPDATE_PRICE_SCALE_OPTS = auto()
    UPDATE_IND_PKG = auto()
    POPULATE_IND_PKGS = auto()

    # Series Commands
    SET_SERIES_DATA = auto()
    CLEAR_SERIES_DATA = auto()
    UPDATE_SERIES_DATA = auto()
    CHANGE_SERIES_TYPE = auto()
    UPDATE_SERIES_OPTS = auto()
    # Series Markers
    ADD_SERIES_MARKER = auto()
    REMOVE_SERIES_MARKER = auto()
    UPDATE_SERIES_MARKER = auto()
    FILTER_SERIES_MARKERS = auto()
    REMOVE_ALL_SERIES_MARKERS = auto()
    # Series Pricelines
    ADD_SERIES_PRICELINE = auto()
    REMOVE_SERIES_PRICELINE = auto()
    UPDATE_SERIES_PRICELINE = auto()
    FILTER_SERIES_PRICELINES = auto()
    REMOVE_ALL_SERIES_PRICELINES = auto()

    # Primitives
    ADD_PRIMITIVE_SET = auto()
    REMOVE_PRIMITIVE_SET = auto()
    CREATE_PRIMITIVE = auto()
    REMOVE_PRIMITIVE = auto()
    UPDATE_PRIMITIVE_OPTS = auto()
