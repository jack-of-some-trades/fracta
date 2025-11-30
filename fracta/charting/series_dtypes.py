"""
Classes that handle the implementation of Abstract and Specific Chart Series Objects

(Classes known as ISeriesAPI in the Lightweight-Charts API)
Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/ISeriesApi
"""

from __future__ import annotations
from dataclasses import asdict, dataclass, field
from enum import IntEnum, auto
from inspect import signature
import logging
from typing import Any, Dict, Literal, Optional, Self, TypeAlias

import pandas as pd

from ..types import Time, JS_Color

logger = logging.getLogger("fracta_log")

# pylint: disable="invalid-name"


class SeriesType(IntEnum):
    """
    Represents the type of options for each series type.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api#seriestype

    This Enum is ultimately a Super set of of the Series Types described in the above documentation.
    In actuality this matches the Series_Type enum in series-base.ts
    """

    WhitespaceData = 0

    SingleValueData = auto()
    Line = auto()
    Area = auto()
    Baseline = auto()
    Histogram = auto()

    OHLC_Data = auto()
    Bar = auto()
    Candlestick = auto()

    Rounded_Candle = auto()

    @staticmethod
    def OHLC_Derived(s_type: SeriesType | AnySeriesData) -> bool:
        "Returns True if the given SeriesType or Data Class is derived from OHLC Data"
        if isinstance(s_type, AnySeriesData):
            return isinstance(
                s_type,
                (OhlcData, BarData, CandlestickData, RoundedCandleData),
            )
        else:
            return s_type in (
                SeriesType.OHLC_Data,
                SeriesType.Bar,
                SeriesType.Candlestick,
                SeriesType.Rounded_Candle,
            )

    @staticmethod
    def SValue_Derived(s_type: SeriesType | AnySeriesData) -> bool:
        "Returns True if the given SeriesType or Data Class is derived from Single-Value Data"
        if isinstance(s_type, AnySeriesData):
            return isinstance(
                s_type,
                (
                    SingleValueData,
                    LineData,
                    AreaData,
                    HistogramData,
                    BaselineData,
                ),
            )
        else:
            return s_type in (
                SeriesType.SingleValueData,
                SeriesType.Line,
                SeriesType.Area,
                SeriesType.Baseline,
                SeriesType.Histogram,
            )

    @staticmethod
    def data_type(df: pd.DataFrame) -> AnyBasicSeriesType:
        "Checks the column names of a DataFrame and return the data type"
        column_names = set(df.columns)
        if "close" in column_names:
            return SeriesType.OHLC_Data
        elif "value" in column_names:
            return SeriesType.SingleValueData
        else:  # Only a time Column Exists
            return SeriesType.WhitespaceData

    @property
    def cls(self) -> type:
        "Returns the DataClass this Type corresponds too"
        match self:
            case SeriesType.Bar:
                return BarData
            case SeriesType.Candlestick:
                return CandlestickData
            case SeriesType.Rounded_Candle:
                return RoundedCandleData
            case SeriesType.Area:
                return AreaData
            case SeriesType.Baseline:
                return BaselineData
            case SeriesType.Line:
                return LineData
            case SeriesType.Histogram:
                return HistogramData
            case SeriesType.SingleValueData:
                return SingleValueData
            case SeriesType.OHLC_Data:
                return OhlcData
            case _:  # Whitespace and Custom
                return WhitespaceData

    @property
    def params(self) -> set:
        "A set of the Parameters that compose this Series Type"
        return set(signature(self.cls).parameters.keys())


AnyBasicSeriesType = Literal[SeriesType.WhitespaceData, SeriesType.SingleValueData, SeriesType.OHLC_Data]


# region ---------------------------------- Series Data Types ---------------------------------- #


@dataclass
class WhitespaceData:
    """
    Represents a whitespace data item, which is a data point without a value.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/WhitespaceData
    """

    time: Time
    custom_values: Optional[Dict[str, Any]] = field(default=None, kw_only=True)
    # All Data outside of what is expected is deleted by lightweight-charts when it
    # is passed through setData(). e.g. setData({time:*, value:*, my_val:*}) only stores
    # {time:*, value:*} since my_val is not recognized by lightweight charts.

    # However, such values can be placed in the custom_values dict then later retrieved by
    # a TS/JS LWC Plugin through the series.data() call

    def __post_init__(self):  # Ensure Consistent Time Format (UTC, TZ Aware).
        self.time = pd.Timestamp(self.time)
        if self.time.tzinfo is not None:
            self.time = self.time.tz_convert("UTC")
        else:
            self.time = self.time.tz_localize("UTC")

    @property
    def as_dict(self) -> dict:
        "The Object in dictionary form with 'Nones' Dropped."
        return asdict(self, dict_factory=lambda x: {k: v for (k, v) in x if v is not None})  # Drop Nones

    @classmethod
    def from_dict(cls, obj: dict) -> Self:
        "Create an instance from a dict ignoring extraneous params"
        params = signature(cls).parameters
        return cls(**{k: v for k, v in obj.items() if k in params})


@dataclass
class OhlcData(WhitespaceData):
    """
    Represents a bar with a time, open, high, low, and close prices.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/OhlcData
    """

    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    close: Optional[float] = None
    volume: Optional[float] = None  # Added by this library


@dataclass
class BarData(OhlcData):
    """
    Structure describing a single item of data for bar series.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/BarData
    """

    color: Optional[str] = None


@dataclass
class CandlestickData(OhlcData):
    """
    Structure describing a single item of data for candlestick series.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/CandlestickData
    """

    color: Optional[str] = None
    wickColor: Optional[str] = None
    borderColor: Optional[str] = None


@dataclass
class RoundedCandleData(OhlcData):
    """
    Structure describing a single item of data for rounded candlestick series.
    """

    color: Optional[str] = None
    wickColor: Optional[str] = None


@dataclass
class Point(WhitespaceData):
    """
    A single point on a time chart. Really, this is SingleValueData as defined by LWC, 
    but this library defines SingleValueData as having a volume param.
    """

    value: Optional[float] = None

@dataclass
class SingleValueData(Point):
    """
    Represents a data point of a single-value series.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/SingleValueData
    """

    volume: Optional[float] = None  # Added by this library


@dataclass
class HistogramData(SingleValueData):
    """
    Structure describing a single item of data for histogram series.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/HistogramData
    """

    color: Optional[JS_Color] = None


@dataclass
class LineData(SingleValueData):
    """
    Structure describing a single item of data for line series.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/LineData
    """

    color: Optional[JS_Color] = None


@dataclass
class AreaData(SingleValueData):
    """
    Structure describing a single item of data for area series.
    Docs:https://tradingview.github.io/lightweight-charts/docs/api/interfaces/AreaData
    """

    lineColor: Optional[JS_Color] = None
    topColor: Optional[JS_Color] = None
    bottomColor: Optional[JS_Color] = None


@dataclass
class BaselineData(SingleValueData):
    """
    Structure describing a single item of data for baseline series.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/BaselineData
    """

    topLineColor: Optional[JS_Color] = None
    topFillColor1: Optional[JS_Color] = None
    topFillColor2: Optional[JS_Color] = None
    bottomLineColor: Optional[JS_Color] = None
    bottomFillColor1: Optional[JS_Color] = None
    bottomFillColor2: Optional[JS_Color] = None


AnyBasicData: TypeAlias = WhitespaceData | SingleValueData | OhlcData

AnySeriesData: TypeAlias = (
    WhitespaceData
    | SingleValueData
    | OhlcData
    | LineData
    | AreaData
    | HistogramData
    | BaselineData
    | BarData
    | CandlestickData
    | RoundedCandleData
)

# endregion

# region --------------------------------- Renaming Maps --------------------------------- #


@dataclass
class ArgMap:  # TODO : Convert to a typed Dict
    """
    Renaming map to specify how the columns of a DataFrame should map to a Displayable Series.
    This object can cover value mapping for Line, Histogram, and Bar series

    If needed, new names can be dynamically added for custom series behavior. Note: This would
    require a custom series primitive to be made within the TypeScript portion of this module.
    """

    value: Optional[str] = None
    close: Optional[str] = None
    open: Optional[str] = None
    high: Optional[str] = None
    low: Optional[str] = None
    color: Optional[str] = None
    custom_values: Optional[str] = None

    def __post_init__(self):
        # Ensure cross display compatability between single value and OHLC series
        if self.value is None and self.close is not None:
            self.value = self.close
        elif self.close is None and self.value is not None:
            self.close = self.value

    @property
    def as_dict(self) -> Dict[str, str]:
        "Object as a dict with Nones and equivalent kv pairs (e.g. 'value' == 'value') dropped"
        return asdict(
            self,
            dict_factory=lambda x: {k: v for (k, v) in x if v is not None and k != v},
        )


class BarArgMap(ArgMap):
    "Value Map Extention for Candlestick and Rounded Candlestick Series"

    wickColor: Optional[str] = None


class CandleArgMap(BarArgMap):
    "Value Map Extention for Candlestick and Rounded Candlestick Series"

    borderColor: Optional[str] = None


class AreaArgMap(ArgMap):
    "Value Map Extention for an Area Series"

    lineColor: Optional[str] = None
    topColor: Optional[str] = None
    bottomColor: Optional[str] = None


class BaselineArgMap(ArgMap):
    "Value Map Extention for a Baseline Series"

    topLineColor: Optional[str] = None
    topFillColor1: Optional[str] = None
    topFillColor2: Optional[str] = None
    bottomLineColor: Optional[str] = None
    bottomFillColor1: Optional[str] = None
    bottomFillColor2: Optional[str] = None


# endregion
