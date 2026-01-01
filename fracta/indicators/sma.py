from enum import Enum, auto
from dataclasses import dataclass
from typing import Optional

import pandas as pd

from fracta.charting.indicator import (
    Indicator_Parent_T,
    Indicator,
    IndicatorOptions,
    SeriesData,
    default_output_property,
    param,
)
from fracta.charting.primitive import TrendLine
from fracta.charting.series_dtypes import Point

from fracta import Color, SingleValueData
from fracta.charting import series_common as sc


class Method(Enum):
    "Calculation Methods"

    SMA = auto()
    EMA = auto()
    RMA = auto()


@dataclass
class SMAOptions(IndicatorOptions):
    "Dataclass of Options for the SMA Indicator"

    src: Optional[SeriesData] = None
    method: Method = param(Method.SMA, "Calculation Method")
    period: int = param(9, "Period")
    color: ... = param(Color.from_rgb(200, 50, 100), "Line Color", inline="line_style")
    size: ... = param(1, "Line Size", inline="line_style", min=0, max=5)


# pylint: disable=arguments-differ possibly-unused-variable
class SMA(Indicator):
    "Simple Moving Average Indicator"

    __options__ = SMAOptions
    __registered__ = True

    def __init__(
        self,
        parent: Indicator_Parent_T,
        opts: Optional[SMAOptions] = None,
        display_name: str = "",
    ):
        super().__init__(parent, display_name=display_name)
        if opts is None:
            opts = SMAOptions()

        self.src = None
        self.period = 0
        self._data = pd.Series()
        self.line_series = sc.LineSeries(self, name="My SMA")
        self.line_series.apply_options(sc.LineStyleOptions(lineStyle=sc.LineStyle.SparseDotted))

        self.trend_line = TrendLine(self)
        self.trend_line.apply_options({"p1": Point("01-01-2018", 50), "p2": Point("01-01-2022", 200)})

        self.update_options(opts)
        self.init_menu(opts)
        self.recalculate()

    def update_options(self, opts: SMAOptions) -> bool:
        self.line_series.apply_options(sc.LineStyleOptions(color=opts.color, lineWidth=opts.size))

        if self.period != opts.period:
            self.period = opts.period
            recalc = True

        if opts.src is None:
            opts.src = self.default_parent_src

        if self.src != opts.src:
            self.src = opts.src
            self.link_args({"data": self.src})
            recalc = True

        return "recalc" in locals()

    def set_data(self, data: pd.Series, *_, **__):
        self._data = data.rolling(window=self.period).mean()
        self.line_series.set_data(self._data)

    def update_data(self, time: pd.Timestamp, data: pd.Series, *_, **__):
        self._data[time] = data.tail(self.period).mean()
        self.line_series.update_data(SingleValueData(time, self._data.iloc[-1]))

        self.trend_line.apply_options(
            {
                "p1": Point(time - pd.Timedelta("10D"), self._data.iloc[-1] - 10),
                "p2": Point(time + pd.Timedelta("10D"), self._data.iloc[-1] + 10),
            }
        )

    @default_output_property
    def average(self) -> pd.Series:
        "The resulting SMA"
        return self._data
