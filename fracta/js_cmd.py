"""
Implementations of Command Functions that return formatted Javascript ready for execution
All Functions wave been rolled-up into VIEW_CMD_ROLODEX that Maps {JS_CMD: Function}
"""

from math import floor
from enum import Enum, IntEnum, auto
from typing import Callable, Any, Optional
from json import JSONEncoder, dumps
from dataclasses import is_dataclass, asdict

from pandas import DataFrame, Timestamp, notnull

from .types import Color, j_func, TF

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


class JS_CMD(IntEnum):
    "Enumeration of the various commands that Python can send to Javascript"

    # Window Commands
    JS_CODE = auto()
    RESOLVE_PROMISE = auto()
    LOAD_CSS = auto()
    ADD_CONTAINER = auto()
    REMOVE_CONTAINER = auto()
    REMOVE_REFERENCE = auto()
    UPDATE_TF_OPTS = auto()
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
    DELETE_INDICATOR = auto()

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
    ADD_IND_PRIMITIVE = auto()
    REMOVE_IND_PRIMITIVE = auto()
    UPDATE_IND_PRIMITIVE = auto()

    # Series Commands
    SET_SERIES_DATA = auto()
    CLEAR_SERIES_DATA = auto()
    UPDATE_SERIES_DATA = auto()
    CHANGE_SERIES_TYPE = auto()
    UPDATE_SERIES_OPTS = auto()

    ADD_SERIES_MARKER = auto()
    REMOVE_SERIES_MARKER = auto()
    UPDATE_SERIES_MARKER = auto()
    FILTER_SERIES_MARKERS = auto()
    REMOVE_ALL_SERIES_MARKERS = auto()

    ADD_SERIES_PRICELINE = auto()
    REMOVE_SERIES_PRICELINE = auto()
    UPDATE_SERIES_PRICELINE = auto()
    FILTER_SERIES_PRICELINES = auto()
    REMOVE_ALL_SERIES_PRICELINES = auto()

    # PyWebView Commands
    SHOW = auto()
    HIDE = auto()
    CLOSE = auto()
    RESTORE = auto()
    MAXIMIZE = auto()
    MINIMIZE = auto()


# region ------------------------ Window ------------------------ #


def js_code(*scripts: str) -> str:
    cmd = ""
    for script in scripts:
        cmd += script + ";"
    return cmd


def resolve_promise(promise_key: str, data: dict) -> str:
    return f"api.resolve_promise({promise_key}, {dump(data)});"


def add_container(_id: str) -> str:
    return f"var {_id} = container_manager.add_container('{_id}');"


def remove_container(_id: str) -> str:
    return f"container_manager.remove_container('{_id}');"


# ** Crucial Step ** Without this there would be a massive memory leak
# Where all the old frames/panes/series objects would never get garbage collected
# in the javascript window due to the global reference to them
def remove_reference(*_ids: str) -> str:
    cmd = ""
    for _id in _ids:
        cmd += f"delete window.{_id};"
    return cmd


def set_window_layouts(favs: dict) -> str:
    return f"api.update_layout_topbar_opts({dump(favs)});"


def set_window_series_types(favs: dict) -> str:
    return f"api.update_series_topbar_opts({dump(favs)});"


def set_window_timeframes(opts: dict) -> str:
    return f"api.update_timeframe_topbar_opts({dump(opts)});"


def update_symbol_search(tickers: list) -> str:
    return f"api.populate_search_tickers({dump(tickers)});"


def update_symbol_search_bubbles(category: str, opts: list[str]) -> str:
    return f"api.set_search_filters('{category}', {dump(opts)});"


def set_user_colors(opts: list[Color]) -> str:
    return f"api.set_user_colors({dumps([color.to_hex() for color in opts])});"


def update_ind_pkg(pkg_key: str, pkg: object):
    # The api func is a solidJS setStore func so address the relevant package to update.
    return f'api.populate_indicator_pkgs("{pkg_key}", {dump(pkg)});'


def populate_indicator_pkgs(pkgs: object) -> str:
    return f"api.populate_indicator_pkgs({dump(pkgs)});"


# endregion

# region ------------------------ Container & Frame ------------------------ #


def set_layout(container_id: str, layout: Enum) -> str:
    return f"{container_id}.set_layout({layout});"


def add_frame(container_id: str, frame_id: str, _type: Enum) -> str:
    return f"var {frame_id} = {container_id}.add_frame('{frame_id}', {_type.value});"


def remove_frame(container_id: str, frame_id: str) -> str:
    return f"{container_id}.remove_frame('{frame_id}');"


def add_pane(frame_id: str, pane_id: str) -> str:
    return f"var {pane_id} = {frame_id}.add_pane('{pane_id}');"


def set_frame_series_type(frame_id: str, series: Enum) -> str:
    return f"{frame_id}.set_series_type({series});"


def set_frame_symbol(frame_id: str, ticker: object) -> str:
    return f"{frame_id}.set_ticker({dump(ticker)});"


def set_frame_timeframe(frame_id: str, timeframe: TF) -> str:
    return f"{frame_id}.set_timeframe('{timeframe.toStr}');"


def set_whitespace_data(frame_id: str, data: DataFrame, curr_time: object) -> str:
    return f"{frame_id}.set_whitespace_data({data.to_json(orient="records",date_unit='s')}, {dump(curr_time)});"


def clear_whitespace_data(frame_id: str) -> str:
    return f"{frame_id}.set_whitespace_data([]);"


def update_whitespace_data(frame_id: str, data: object, curr_time: object) -> str:
    return f"{frame_id}.update_whitespace_data({dump(data)}, {dump(curr_time)});"


def autoscale_time_axis(frame_id: str):
    return f"{frame_id}.autoscaleContent();"


# endregion

# region ------------------------ Pane ------------------------ #


def create_indicator(
    frame_id: str,
    indicator_id: str,
    outputs: dict,
    indicator_type: str,
    name: str,
) -> str:
    return f"{frame_id}.create_indicator('{indicator_id}','{indicator_type}','{name}', {dump(outputs)});"


def delete_indicator(frame_id: str, indicator_id: str) -> str:
    return f"{frame_id}.delete_indicator('{indicator_id}');"


# Retreives an indicator object from a frame to manipulate
def indicator_preamble(frame_id: str, indicator_id: str) -> str:
    # _ind is a workspace var defined at the window level in index.ts for use here
    return f"_ind = {frame_id}.attached.get('{indicator_id}');"


# Retreives a series object from an indicator to manipulate
def series_preamble(frame_id: str, indicator_id: str, series_id: str) -> str:
    # _ind is a workspace var defined at the window level in index.ts for use here
    return f"_ser = {frame_id}.attached.get('{indicator_id}').series.get('{series_id}');"


def indicator_set_menu(frame_id: str, indicator_id: str, menu_struct, options) -> str:
    return indicator_preamble(frame_id, indicator_id) + f"_ind.set_menu_struct({dump(menu_struct)}, {dump(options)});"


def indicator_set_options(frame_id: str, indicator_id: str, options) -> str:
    return indicator_preamble(frame_id, indicator_id) + f"_ind.applyOptions({dump(options)});"


def set_legend_label(frame_id: str, indicator_id: str, label: str) -> str:
    return indicator_preamble(frame_id, indicator_id) + f"_ind.setLabel('{label}');"


# region ------------------------ Indicator Series ------------------------ #
# all functions should take Pane_id, Indicator_Id, and Series_id in that order.


def add_series(
    frame_id: str,
    indicator_id: str,
    series_id: str,
    series_type: Enum,
    name: Optional[str],
) -> str:
    return indicator_preamble(frame_id, indicator_id) + f"_ind.add_series('{series_id}', {series_type}, {dump(name)});"


def remove_series(frame_id: str, indicator_id: str, series_id: str) -> str:
    return indicator_preamble(frame_id, indicator_id) + f"_ind.remove_series('{series_id}');"


def set_series_data(frame_id: str, indicator_id: str, series_id: str, data: DataFrame) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + f"_ser.setData({dump(data)});"


def clear_series_data(frame_id: str, indicator_id: str, series_id: str) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + "_ser.setData([]);"


def update_series_data(frame_id: str, indicator_id: str, series_id: str, data: object) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + f"_ser.update({dump(data)});"


def change_series_type(
    frame_id: str,
    indicator_id: str,
    series_id: str,
    series_type: Enum,
    data: DataFrame,
) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + f"_ser.change_series_type({series_type}, {dump(data)});"


def update_series_opts(frame_id: str, indicator_id: str, series_id: str, opts: object) -> str:
    return j_func.format(series_preamble(frame_id, indicator_id, series_id) + f"_ser.applyOptions({dump(opts)});")


def update_scale_opts(frame_id: str, indicator_id: str, series_id: str, opts: object) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + f"_ser.priceScale().applyOptions({dump(opts)});"


# region ------------------------ Series Markers ------------------------ #


def remove_marker(frame_id: str, indicator_id: str, series_id: str, mark_id: str) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + f"_ser.removeMarker('{mark_id}');"


def update_marker(frame_id: str, indicator_id: str, series_id: str, mark_id: str, marker: object) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + f"_ser.updateMarker('{mark_id}', {dump(marker)});"


def filter_markers(frame_id: str, indicator_id: str, series_id: str, mark_ids: list[str]) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + f"_ser.filterMarkers({dump(mark_ids)});"


def remove_all_markers(frame_id: str, indicator_id: str, series_id: str) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + "_ser.removeAllMarkers();"


# endregion


# region ------------------------ Series Pricelines ------------------------ #


def add_priceline(frame_id: str, indicator_id: str, series_id: str, line_id: str, line: object) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + f"_ser.createPriceLine('{line_id}', {dump(line)});"


def remove_priceline(frame_id: str, indicator_id: str, series_id: str, line_id: str) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + f"_ser.removePriceLine('{line_id}');"


def update_priceline(frame_id: str, indicator_id: str, series_id: str, line_id: str, line: object) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + f"_ser.updatePriceLine('{line_id}', {dump(line)});"


def filter_pricelines(frame_id: str, indicator_id: str, series_id: str, line_ids: list[str]) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + f"_ser.filterPriceLines({dump(line_ids)});"


def remove_all_pricelines(frame_id: str, indicator_id: str, series_id: str) -> str:
    return series_preamble(frame_id, indicator_id, series_id) + "_ser.removeAllPriceLines();"


# endregion


# endregion

# region ------------------------ Indicator Primitives ------------------------ #


def add_ind_primitive(
    frame_id: str,
    indicator_id: str,
    primitive_id: str,
    primitive_type: str,
    args: dict[str, Any],
) -> str:
    return (
        indicator_preamble(frame_id, indicator_id)
        + f"_ind.add_primitive('{primitive_id}','{primitive_type}', {dump(args)});"
    )


def remove_ind_primitive(
    frame_id: str,
    indicator_id: str,
    primitive_id: str,
) -> str:
    return indicator_preamble(frame_id, indicator_id) + f"_ind.remove_primitive('{primitive_id}');"


def update_ind_primitive(
    frame_id: str,
    indicator_id: str,
    primitive_id: str,
    args: dict[str, Any],
) -> str:
    return indicator_preamble(frame_id, indicator_id) + f"_ind.update_primitive('{primitive_id}', {dump(args)});"


# endregion

# endregion


def lambda_none(*_) -> None:
    "The Queue Manager will interpret this to mean a PyWv command was given."
    return None


VIEW_CMD_ROLODEX: dict[JS_CMD, Callable[..., str | None]] = {
    # ---- Window Commands ----
    JS_CMD.JS_CODE: js_code,
    JS_CMD.RESOLVE_PROMISE: resolve_promise,
    JS_CMD.ADD_CONTAINER: add_container,
    JS_CMD.REMOVE_CONTAINER: remove_container,
    JS_CMD.REMOVE_REFERENCE: remove_reference,
    JS_CMD.UPDATE_TF_OPTS: set_window_timeframes,
    JS_CMD.UPDATE_SERIES_FAVS: set_window_series_types,
    JS_CMD.UPDATE_LAYOUT_FAVS: set_window_layouts,
    JS_CMD.SET_USER_COLORS: set_user_colors,
    JS_CMD.SET_SYMBOL_ITEMS: update_symbol_search,
    JS_CMD.SET_SYMBOL_SEARCH_OPTS: update_symbol_search_bubbles,
    # ---- Container Commands ----
    JS_CMD.SET_LAYOUT: set_layout,
    JS_CMD.ADD_FRAME: add_frame,
    JS_CMD.REMOVE_FRAME: remove_frame,
    # ---- Frame Commands ----
    JS_CMD.ADD_PANE: add_pane,
    JS_CMD.AUTOSCALE_TIME_AXIS: autoscale_time_axis,
    JS_CMD.SET_WHITESPACE_DATA: set_whitespace_data,
    JS_CMD.CLEAR_WHITESPACE_DATA: clear_whitespace_data,
    JS_CMD.UPDATE_WHITESPACE_DATA: update_whitespace_data,
    JS_CMD.SET_FRAME_SYMBOL: set_frame_symbol,
    JS_CMD.SET_FRAME_TIMEFRAME: set_frame_timeframe,
    JS_CMD.SET_FRAME_SERIES_TYPE: set_frame_series_type,
    JS_CMD.CREATE_INDICATOR: create_indicator,
    JS_CMD.DELETE_INDICATOR: delete_indicator,
    # ---- Pane Commands ----
    # ---- Indicator Commands ----
    JS_CMD.ADD_SERIES: add_series,
    JS_CMD.REMOVE_SERIES: remove_series,
    JS_CMD.SET_SERIES_DATA: set_series_data,
    JS_CMD.SET_LEGEND_LABEL: set_legend_label,
    JS_CMD.ADD_IND_PRIMITIVE: add_ind_primitive,
    JS_CMD.REMOVE_IND_PRIMITIVE: remove_ind_primitive,
    JS_CMD.UPDATE_IND_PRIMITIVE: update_ind_primitive,
    JS_CMD.SET_INDICATOR_MENU: indicator_set_menu,
    JS_CMD.SET_INDICATOR_OPTIONS: indicator_set_options,
    JS_CMD.UPDATE_IND_PKG: update_ind_pkg,
    JS_CMD.POPULATE_IND_PKGS: populate_indicator_pkgs,
    # ---- Series Commands ----
    JS_CMD.CLEAR_SERIES_DATA: clear_series_data,
    JS_CMD.UPDATE_SERIES_DATA: update_series_data,
    JS_CMD.CHANGE_SERIES_TYPE: change_series_type,
    JS_CMD.UPDATE_SERIES_OPTS: update_series_opts,
    JS_CMD.UPDATE_PRICE_SCALE_OPTS: update_scale_opts,
    JS_CMD.ADD_SERIES_MARKER: update_marker,
    JS_CMD.REMOVE_SERIES_MARKER: remove_marker,
    JS_CMD.UPDATE_SERIES_MARKER: update_marker,
    JS_CMD.FILTER_SERIES_MARKERS: filter_markers,
    JS_CMD.REMOVE_ALL_SERIES_MARKERS: remove_all_markers,
    JS_CMD.ADD_SERIES_PRICELINE: add_priceline,
    JS_CMD.REMOVE_SERIES_PRICELINE: remove_priceline,
    JS_CMD.UPDATE_SERIES_PRICELINE: update_priceline,
    JS_CMD.FILTER_SERIES_PRICELINES: filter_pricelines,
    JS_CMD.REMOVE_ALL_SERIES_PRICELINES: remove_all_pricelines,
    # ---- PyWebView Commands ----
    JS_CMD.SHOW: lambda_none,
    JS_CMD.HIDE: lambda_none,
    JS_CMD.CLOSE: lambda_none,
    JS_CMD.RESTORE: lambda_none,
    JS_CMD.MAXIMIZE: lambda_none,
    JS_CMD.MINIMIZE: lambda_none,
    JS_CMD.LOAD_CSS: lambda_none,
}
