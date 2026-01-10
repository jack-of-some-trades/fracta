"""Charting Frame Subclass. Supplies the necessary functions to update and manipulate a chart"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Optional

import pandas as pd


from .. import util
from .. import py_window as win
from ..py_cmd import PY_CMD, register_py_cmd
from ..js_cmd import JS_CMD
from ..types import TF, Ticker
from . import primitive_set as ps
from .indicator import Indicator, retrieve_indicator_cls
from .. import indicators

if TYPE_CHECKING:
    from .series_dtypes import AnyBasicData, SeriesType, SingleValueData

logger = logging.getLogger("fracta_log")


class ChartingFrame(win.Frame, ps.PrimitiveSetHolder):
    """
    Charting Frames store, display and compute on time-series data.

    Currently, This can only display a single pane and thus a single chart,
    but the framework is present so that in the future each frame could
    display multiple charts that all share the same available data.
    """

    Frame_Type = win.FrameTypes.CHART

    def __init__(self, parent: win.Container, _js_id: Optional[str] = None) -> None:
        ps.PrimitiveSetHolder.__init__(self)
        win.Frame.__init__(self, parent, parent._associate_frame(self, _js_id))

        # Indicators append themselves to the ID_Dict, See Indicator DocString for reasoning.
        self._indicators = util.ID_Dict[Indicator]("i")
        self._primitive_sets = util.ID_Dict[ps.PrimitiveSet]("ps")
        # Add main Timeseries that should ever be deleted
        self._timeseries = indicators.Timeseries(self, js_id=indicators.Timeseries.__special_id__)

    def delete(self):
        for indicator in self._indicators.copy().values():
            indicator.delete()
        for primitive_set in self._primitive_sets.copy().values():
            primitive_set.delete()

    # region ------------- Dunder Control Functions ------------- #

    def __set_whitespace__(self, data: pd.DataFrame, curr_time: "SingleValueData"):
        self.fwd_queue.put((JS_CMD.SET_WHITESPACE_DATA, self._js_id, data, curr_time))

    def __clear_whitespace__(self):
        self.fwd_queue.put((JS_CMD.CLEAR_WHITESPACE_DATA, self._js_id))

    def __update_whitespace__(self, data: "AnyBasicData", curr_time: "SingleValueData"):
        self.fwd_queue.put((JS_CMD.UPDATE_WHITESPACE_DATA, self._js_id, data, curr_time))

    def __set_displayed_symbol__(self, symbol: Ticker):
        "*Does not change underlying data Symbol*"
        self.fwd_queue.put((JS_CMD.SET_FRAME_SYMBOL, self._js_id, symbol))

    def __set_displayed_timeframe__(self, timeframe: TF):
        "*Does not change underlying data TF*"
        self.fwd_queue.put((JS_CMD.SET_FRAME_TIMEFRAME, self._js_id, timeframe))

    def __set_displayed_series_type__(self, series_type: "SeriesType"):
        "*Does not change underlying data Type*"
        self.fwd_queue.put((JS_CMD.SET_FRAME_SERIES_TYPE, self._js_id, series_type))

    # endregion

    def all_ids(self) -> list[str]:
        "Return a List of all Ids of this object and sub-objects placed into the global window namespace"
        return [self._js_id]

    def autoscale_timeaxis(self):
        "Autoscale the Time axis of all panes owned by this Charting Frame"
        self.fwd_queue.put((JS_CMD.AUTOSCALE_TIME_AXIS, self._js_id))

    # region ------------- Indicator Functions ------------- #

    @property
    def timeseries(self) -> indicators.Timeseries:
        "Timeseries Indicator that contains the Frame's main series data"
        main_series = self._indicators[self._indicators.prefix + indicators.Timeseries.__special_id__]
        if isinstance(main_series, indicators.Timeseries):
            return main_series
        raise AttributeError(f"Cannot find Main Series for Frame {self._js_id}")

    def indicator(self, _id: str | int) -> Indicator:
        "Return the indicator that matches either the given js_id, or the indicator #"
        return self._indicators[_id]

    def _associate_indicator(self, indicator: Indicator, js_id: Optional[str] = None) -> str:
        "Attach an Indicator to this Frame and return the JS ID it is stored under"
        if js_id is None:
            return self._indicators.generate_id(indicator)
        else:
            return self._indicators.affix_id(js_id, indicator)

    def _deassociate_indicator(self, _id: str | int):
        "Remove and Delete an Indicator"
        try:
            self._indicators[_id].delete()
        except (KeyError, IndexError):
            logger.warning(
                "Could not delete Indicator '%s'. It does not exist on frame '%s'",
                _id,
                self._js_id,
            )

    def get_indicators_of_type[T: Indicator](self, _type: type[T]) -> dict[str, T]:
        "Returns a Dictionary of Indicators applied to this Frame that are of the Given Type"
        rtn_dict = {}
        for _key, _ind in self._indicators.items():
            if isinstance(_ind, _type):
                rtn_dict[_key] = _ind
        return rtn_dict

    def request_indicator(self, pkg_key, ind_key, display_name: str = ""):
        "Request that an Indicator instance be loaded into this frame"
        cls = retrieve_indicator_cls(pkg_key, ind_key)
        if cls is not None:
            cls(parent=self, display_name=display_name)

    # endregion

    # region ------------- Primitive Set Functions ------------- #

    def add_primitive_set(
        self, pane_index: int = 0, name: Optional[str] = None, js_id: Optional[str] = None
    ) -> ps.PrimitiveSet:
        "Request that a Primitive Set instance be added to this frame"
        raise NotImplementedError("Primitive Set addition is not yet supported for ChartingFrames")

    def delete_primitive_set(self, _ref: str | int | ps.PrimitiveSet):
        "Request that a Primitive Set instance be deleted from this frame"
        raise NotImplementedError("Primitive Set deletion is not yet supported for ChartingFrames")

    # endregion


# region ------------- PY CMD Functions ------------- #


def ensure_charting_frame(frame: win.Frame) -> ChartingFrame:
    "Ensure the given frame is a ChartingFrame Type"
    if isinstance(frame, ChartingFrame):
        return frame
    else:
        raise ReferenceError(f"Given reference is not a ChartingFrame as Expected, {frame}")


@register_py_cmd(PY_CMD.TIMESERIES_REQUEST)
def timeseries_request(window: "win.Window", c_id, f_id, ticker, tf):
    try:
        ticker = Ticker.from_dict(ticker)
        tf = TF.fromStr(tf)
    except ValueError as e:
        logger.warning(e)
        return

    frame = ensure_charting_frame(window.container(c_id).frame(f_id))
    frame.timeseries.request_timeseries(ticker=ticker, timeframe=tf)


@register_py_cmd(PY_CMD.INDICATOR_REQUEST)
def indicator_request(window: "win.Window", c_id, f_id, ind_pkg, ind_type):
    frame = ensure_charting_frame(window.container(c_id).frame(f_id))
    frame.request_indicator(ind_pkg, ind_type)


@register_py_cmd(PY_CMD.LAYOUT_CHANGE)
def layout_change(window: "win.Window", c_id, layout):
    container = window.container(c_id)
    container.set_layout(layout)


@register_py_cmd(PY_CMD.SERIES_CHANGE)
def series_change(window: "win.Window", c_id, f_id, _type):
    frame = ensure_charting_frame(window.container(c_id).frame(f_id))
    frame.timeseries.change_series_type(_type, True)


@register_py_cmd(PY_CMD.SET_INDICATOR_OPTS)
def set_indicator_options(window: "win.Window", c_id, f_id, i_id, opts):
    frame = ensure_charting_frame(window.container(c_id).frame(f_id))
    frame.indicator(i_id).__update_options__(opts)


@register_py_cmd(PY_CMD.UPDATE_SERIES_OPTS)
def update_series_options(window: "win.Window", c_id, f_id, i_id, s_id, opts):
    frame = ensure_charting_frame(window.container(c_id).frame(f_id))
    frame.indicator(i_id).series(s_id).__sync_options__(opts)


@register_py_cmd(PY_CMD.UPDATE_PRIMITIVE_OPTS)
def update_primitive_opts(window: "win.Window", c_id, f_id, i_id, p_id, opts):
    # Updates a primitive's inner options attribute to reflect changes made via UI
    frame = ensure_charting_frame(window.container(c_id).frame(f_id))
    frame.indicator(i_id).primitive(p_id).__sync_options__(opts)


# endregion
