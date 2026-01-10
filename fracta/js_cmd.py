"""
Implementations of Command Functions that return formatted Javascript ready for execution
All Functions wave been rolled-up into VIEW_CMD_ROLODEX that Maps {JS_CMD: Function}
"""

from dataclasses import asdict, is_dataclass
from enum import Enum, IntEnum, auto
from json import JSONEncoder, dumps
from math import floor
from typing import Any, Optional, Protocol

from pandas import DataFrame, Timestamp, notnull

from .types import TF, Color, j_func

# @pylint: disable=invalid-name, line-too-long, missing-function-docstring


class ORM_JSONEncoder(JSONEncoder):
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
        if isinstance(o, j_func):
            return o.func
        return super().default(o)


def dump(obj: Any) -> str:
    "Enchanced JSON.dumps() to serialize all ORM Objects"
    return dumps(obj, cls=ORM_JSONEncoder, separators=(",", ":"))


def lambda_none(*_) -> None:
    "The Queue Manager will interpret this to mean a PyWv command was given."
    return None


class JS_CMD(IntEnum):
    "Enumeration of the various commands that Python can send to Javascript"

    # Window Commands
    JS_CODE = auto()
    RESOLVE_PROMISE = auto()
    LOAD_CSS = auto()
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

    # PyWebView Commands
    SHOW = auto()
    HIDE = auto()
    CLOSE = auto()
    RESTORE = auto()
    MAXIMIZE = auto()
    MINIMIZE = auto()


class JS_CMD_FUNC(Protocol):
    def __call__(self, *args: Any, **kwds: Any) -> str | None: ...


VIEW_CMD_ROLODEX: dict[JS_CMD, JS_CMD_FUNC] = {
    JS_CMD.SHOW: lambda_none,
    JS_CMD.HIDE: lambda_none,
    JS_CMD.CLOSE: lambda_none,
    JS_CMD.RESTORE: lambda_none,
    JS_CMD.MAXIMIZE: lambda_none,
    JS_CMD.MINIMIZE: lambda_none,
    JS_CMD.LOAD_CSS: lambda_none,
}


def register_js_cmd(cmd: JS_CMD):
    def decorator(func: JS_CMD_FUNC) -> JS_CMD_FUNC:
        VIEW_CMD_ROLODEX[cmd] = func
        return func

    return decorator


# region ------------------------ Window ------------------------ #


@register_js_cmd(JS_CMD.JS_CODE)
def js_code(*scripts: str) -> str:
    cmd = ""
    for script in scripts:
        cmd += script + ";"
    return cmd


@register_js_cmd(JS_CMD.RESOLVE_PROMISE)
def resolve_promise(promise_key: str, data: dict) -> str:
    return f"api.resolve_promise({promise_key}, {dump(data)});"


@register_js_cmd(JS_CMD.ADD_CONTAINER)
def add_container(_id: str) -> str:
    return f"var {_id} = container_manager.add_container('{_id}');"


@register_js_cmd(JS_CMD.REMOVE_CONTAINER)
def remove_container(_id: str) -> str:
    return f"container_manager.remove_container('{_id}');"


# ** Crucial Step ** Without this there would be a massive memory leak
# Where all the old frames/panes/series objects would never get garbage collected
# in the javascript window due to the global reference to them
@register_js_cmd(JS_CMD.REMOVE_REFERENCE)
def remove_reference(*_ids: str) -> str:
    cmd = ""
    for _id in _ids:
        cmd += f"delete window.{_id};"
    return cmd


@register_js_cmd(JS_CMD.UPDATE_LAYOUT_FAVS)
def set_window_layouts(favs: dict) -> str:
    return f"api.update_layout_topbar_opts({dump(favs)});"


@register_js_cmd(JS_CMD.UPDATE_SERIES_FAVS)
def set_window_series_types(favs: dict) -> str:
    return f"api.update_series_topbar_opts({dump(favs)});"


@register_js_cmd(JS_CMD.UPDATE_TF_FAVS)
def set_window_timeframes(opts: dict) -> str:
    return f"api.update_timeframe_topbar_opts({dump(opts)});"


@register_js_cmd(JS_CMD.SET_SYMBOL_ITEMS)
def update_symbol_search(tickers: list) -> str:
    return f"api.populate_search_tickers({dump(tickers)});"


@register_js_cmd(JS_CMD.SET_SYMBOL_SEARCH_OPTS)
def update_symbol_search_bubbles(category: str, opts: list[str]) -> str:
    return f"api.set_search_filters('{category}', {dump(opts)});"


@register_js_cmd(JS_CMD.SET_USER_COLORS)
def set_user_colors(opts: list[Color]) -> str:
    return f"api.set_user_colors({dumps([color.to_hex() for color in opts])});"


@register_js_cmd(JS_CMD.UPDATE_IND_PKG)
def update_ind_pkg(pkg_key: str, pkg: object):
    # The api func is a solidJS setStore func so address the relevant package to update.
    return f'api.populate_indicator_pkgs("{pkg_key}", {dump(pkg)});'


@register_js_cmd(JS_CMD.POPULATE_IND_PKGS)
def populate_indicator_pkgs(pkgs: object) -> str:
    return f"api.populate_indicator_pkgs({dump(pkgs)});"


# endregion

# region ------------------------ Container & Frame ------------------------ #


@register_js_cmd(JS_CMD.SET_LAYOUT)
def set_layout(container_id: str, layout: Enum) -> str:
    return f"{container_id}.set_layout({layout});"


@register_js_cmd(JS_CMD.ADD_FRAME)
def add_frame(container_id: str, frame_id: str, _type: Enum) -> str:
    return f"var {frame_id} = {container_id}.add_frame('{frame_id}', {_type.value});"


@register_js_cmd(JS_CMD.REMOVE_FRAME)
def remove_frame(container_id: str, frame_id: str) -> str:
    return f"{container_id}.remove_frame('{frame_id}');"


@register_js_cmd(JS_CMD.ADD_PANE)  # TODO : OBE? Pane construction has changed.
def add_pane(frame_id: str, pane_id: str) -> str:
    return f"var {pane_id} = {frame_id}.add_pane('{pane_id}');"


@register_js_cmd(JS_CMD.SET_FRAME_SERIES_TYPE)
def set_frame_series_type(frame_id: str, series: Enum) -> str:
    return f"{frame_id}.set_series_type({series});"


@register_js_cmd(JS_CMD.SET_FRAME_SYMBOL)
def set_frame_symbol(frame_id: str, ticker: object) -> str:
    return f"{frame_id}.set_ticker({dump(ticker)});"


@register_js_cmd(JS_CMD.SET_FRAME_TIMEFRAME)
def set_frame_timeframe(frame_id: str, timeframe: TF) -> str:
    return f"{frame_id}.set_timeframe('{timeframe.toStr}');"


@register_js_cmd(JS_CMD.SET_WHITESPACE_DATA)
def set_whitespace_data(frame_id: str, data: DataFrame, curr_time: object) -> str:
    return f"{frame_id}.set_whitespace_data({data.to_json(orient="records",date_unit='s')}, {dump(curr_time)});"


@register_js_cmd(JS_CMD.CLEAR_WHITESPACE_DATA)
def clear_whitespace_data(frame_id: str) -> str:
    return f"{frame_id}.set_whitespace_data([]);"


@register_js_cmd(JS_CMD.UPDATE_WHITESPACE_DATA)
def update_whitespace_data(frame_id: str, data: object, curr_time: object) -> str:
    return f"{frame_id}.update_whitespace_data({dump(data)}, {dump(curr_time)});"


@register_js_cmd(JS_CMD.AUTOSCALE_TIME_AXIS)
def autoscale_time_axis(frame_id: str):
    return f"{frame_id}.autoscaleContent();"


# endregion

# region ------------------------ Pane ------------------------ #


@register_js_cmd(JS_CMD.CREATE_INDICATOR)
def create_indicator(
    frame_id: str,
    indicator_id: str,
    outputs: dict,
    indicator_type: str,
    name: str,
) -> str:
    return f"{frame_id}.create_indicator('{indicator_id}','{indicator_type}','{name}', {dump(outputs)});"


@register_js_cmd(JS_CMD.REMOVE_INDICATOR)
def remove_indicator(frame_id: str, indicator_id: str) -> str:
    return f"{frame_id}.delete_indicator('{indicator_id}');"


# Retreives an indicator object from a frame to manipulate
def indicator_preamble(frame_id: str, indicator_id: str) -> str:
    # _ind is a workspace var defined at the window level in index.ts for use here
    # originally only used for indicators, but adapted to also reference primitive groups
    return f"_ind = {frame_id}.attached.get('{indicator_id}');"


# Retreives a series object from an indicator to manipulate
def series_preamble(frame_id: str, indicator_id: str, series_id: str) -> str:
    # _ind is a workspace var defined at the window level in index.ts for use here
    return f"_ser = {frame_id}.attached.get('{indicator_id}').series.get('{series_id}');"


@register_js_cmd(JS_CMD.SET_INDICATOR_MENU)
def indicator_set_menu(frame_id: str, indicator_id: str, menu_struct, options) -> str:
    return indicator_preamble(frame_id, indicator_id) + f"_ind.set_menu_struct({dump(menu_struct)}, {dump(options)});"


@register_js_cmd(JS_CMD.SET_INDICATOR_OPTIONS)
def indicator_set_options(frame_id: str, indicator_id: str, options) -> str:
    return indicator_preamble(frame_id, indicator_id) + f"_ind.applyOptions({dump(options)}, true);"


@register_js_cmd(JS_CMD.SET_LEGEND_LABEL)
def set_legend_label(frame_id: str, indicator_id: str, label: str) -> str:
    return indicator_preamble(frame_id, indicator_id) + f"_ind.setLabel('{label}');"


# endregion

# region ------------------------ Indicator Series ------------------------ #
# all functions should take Pane_id, Indicator_Id, and Series_id in that order.


@register_js_cmd(JS_CMD.ADD_SERIES)
def add_series(
    frame_id: str,
    indicator_id: str,
    series_id: str,
    series_type: Enum,
    name: Optional[str],
) -> str:
    return indicator_preamble(frame_id, indicator_id) + f"_ind.add_series('{series_id}', {series_type}, {dump(name)});"


@register_js_cmd(JS_CMD.REMOVE_SERIES)
def remove_series(frame_id: str, indicator_id: str, series_id: str) -> str:
    return indicator_preamble(frame_id, indicator_id) + f"_ind.remove_series('{series_id}');"


@register_js_cmd(JS_CMD.SET_SERIES_DATA)
def set_series_data(frame_id: str, indicator_id: str, series_id: str, data: DataFrame) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + f"_ser.setData({dump(data)});"


@register_js_cmd(JS_CMD.CLEAR_SERIES_DATA)
def clear_series_data(frame_id: str, indicator_id: str, series_id: str) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + "_ser.setData([]);"


@register_js_cmd(JS_CMD.UPDATE_SERIES_DATA)
def update_series_data(frame_id: str, indicator_id: str, series_id: str, data: object) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + f"_ser.update({dump(data)});"


@register_js_cmd(JS_CMD.CHANGE_SERIES_TYPE)
def change_series_type(
    frame_id: str,
    indicator_id: str,
    series_id: str,
    series_type: Enum,
    data: DataFrame,
) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + f"_ser.change_series_type({series_type}, {dump(data)});"


@register_js_cmd(JS_CMD.UPDATE_SERIES_OPTS)
def update_series_opts(frame_id: str, indicator_id: str, series_id: str, opts: object) -> str:
    return j_func.format(series_preamble(frame_id, indicator_id, series_id) + f"_ser.applyOptions({dump(opts)}, true);")


@register_js_cmd(JS_CMD.UPDATE_PRICE_SCALE_OPTS)
def update_scale_opts(frame_id: str, indicator_id: str, series_id: str, opts: object) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + f"_ser.priceScale().applyOptions({dump(opts)});"


# endregion

# region ------------------------ Series Markers ------------------------ #


@register_js_cmd(JS_CMD.REMOVE_SERIES_MARKER)
def remove_marker(frame_id: str, indicator_id: str, series_id: str, mark_id: str) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + f"_ser.removeMarker('{mark_id}');"


@register_js_cmd(JS_CMD.UPDATE_SERIES_MARKER)
def update_marker(frame_id: str, indicator_id: str, series_id: str, mark_id: str, marker: object) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + f"_ser.updateMarker('{mark_id}', {dump(marker)});"


@register_js_cmd(JS_CMD.FILTER_SERIES_MARKERS)
def filter_markers(frame_id: str, indicator_id: str, series_id: str, mark_ids: list[str]) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + f"_ser.filterMarkers({dump(mark_ids)});"


@register_js_cmd(JS_CMD.REMOVE_ALL_SERIES_MARKERS)
def remove_all_markers(frame_id: str, indicator_id: str, series_id: str) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + "_ser.removeAllMarkers();"


# endregion

# region ------------------------ Series Pricelines ------------------------ #


@register_js_cmd(JS_CMD.ADD_SERIES_PRICELINE)
def add_priceline(frame_id: str, indicator_id: str, series_id: str, line_id: str, line: object) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + f"_ser.createPriceLine('{line_id}', {dump(line)});"


@register_js_cmd(JS_CMD.REMOVE_SERIES_PRICELINE)
def remove_priceline(frame_id: str, indicator_id: str, series_id: str, line_id: str) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + f"_ser.removePriceLine('{line_id}');"


@register_js_cmd(JS_CMD.UPDATE_SERIES_PRICELINE)
def update_priceline(frame_id: str, indicator_id: str, series_id: str, line_id: str, line: object) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + f"_ser.updatePriceLine('{line_id}', {dump(line)});"


@register_js_cmd(JS_CMD.FILTER_SERIES_PRICELINES)
def filter_pricelines(frame_id: str, indicator_id: str, series_id: str, line_ids: list[str]) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + f"_ser.filterPriceLines({dump(line_ids)});"


@register_js_cmd(JS_CMD.REMOVE_ALL_SERIES_PRICELINES)
def remove_all_pricelines(frame_id: str, indicator_id: str, series_id: str) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + "_ser.removeAllPriceLines();"


# endregion


# region ------------------------ Primitives ------------------------ #


def primitive_set_preamble(frame_id: str, indicator_id: Optional[str], primitive_set_id: str) -> str:
    # _set is a workspace var defined at the window level in index.ts for use as a temp reference to a primitive set
    if indicator_id is None:
        return f"_set = {frame_id}.attached.get('{primitive_set_id}');"
    else:
        return f"_set = {frame_id}.attached.get('{indicator_id}').attached.get('{primitive_set_id}');"


@register_js_cmd(JS_CMD.ADD_PRIMITIVE_SET)
def add_primitive_set(frame_id: str, indicator_id: Optional[str], set_id: str, name: str) -> str:
    return primitive_set_preamble(frame_id, indicator_id, set_id) + f"_set.create_primitive_set('{set_id}', '{name}');"


@register_js_cmd(JS_CMD.REMOVE_PRIMITIVE_SET)
def remove_primitive_set(frame_id: str, indicator_id: Optional[str], set_id: str) -> str:
    return primitive_set_preamble(frame_id, indicator_id, set_id) + f"_set.remove_primitive_set('{set_id}');"


@register_js_cmd(JS_CMD.CREATE_PRIMITIVE)
def create_primitive(
    frame_id: str,
    indicator_id: Optional[str],
    primitive_set_id: str,
    primitive_id: str,
    primitive_type: str,
    args: dict[str, Any],
) -> str:
    return (
        primitive_set_preamble(frame_id, indicator_id, primitive_set_id)
        + f"_set.createPrimitive('{primitive_id}','{primitive_type}', {dump(args)});"
    )


@register_js_cmd(JS_CMD.REMOVE_PRIMITIVE)
def remove_primitive(
    frame_id: str,
    indicator_id: Optional[str],
    primitive_set_id: str,
    primitive_id: str,
) -> str:
    return primitive_set_preamble(frame_id, indicator_id, primitive_set_id) + f"_set.detachPrimitive('{primitive_id}');"


@register_js_cmd(JS_CMD.UPDATE_PRIMITIVE_OPTS)
def update_primitive_opts(
    frame_id: str,
    indicator_id: Optional[str],
    primitive_set_id: str,
    primitive_id: str,
    args: dict[str, Any],
) -> str:
    return (
        primitive_set_preamble(frame_id, indicator_id, primitive_set_id)
        + f"_set.updatePrimitive('{primitive_id}', {dump(args)});"
    )


# endregion
