"""
Classes that handle the implementation of Abstract and Specific Chart Series Objects

(Classes known as ISeriesAPI in the Lightweight-Charts API)
Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/ISeriesApi
"""

from dataclasses import asdict, dataclass, field
from enum import IntEnum, StrEnum, auto
from inspect import signature
import logging
from typing import Literal, Optional, Self, TypeAlias

from ..types import JS_Color, j_func

logger = logging.getLogger("fracta_log")


# pylint: disable="invalid-name", "line-too-long"
# region ------------------------------- Sub-Object Dataclass / Enum -------------------------------- #


@dataclass(slots=True)
class PriceFormatCustom:
    """
    Represents series value formatting options.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/PriceFormatCustom
    """

    type: Literal["custom"] = field(default="custom", init=False)
    minMove: float = 0.01
    formatter: Optional[j_func] = None


@dataclass(slots=True)
class PriceFormat:
    """
    Represents series value formatting options.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/PriceFormatBuiltIn
    """

    type: Literal["price", "volume", "percent"] = "price"
    minMove: float = 0.01
    precision: Optional[float] = None


PriceFormat_T: TypeAlias = PriceFormat | PriceFormatCustom


class PriceLineSource(IntEnum):
    """
    Represents the source of data to be used for the horizontal price line.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/enums/PriceLineSource
    """

    LastBar = 0
    LastVisible = 1


class LineType(IntEnum):
    """
    Represents the possible line types.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/enums/LineType
    """

    Simple = 0
    WithSteps = 1
    Curved = 2


class LineStyle(IntEnum):
    """
    Represents the possible line styles.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/enums/LineStyle
    """

    Solid = 0
    Dotted = 1
    Dashed = 2
    LargeDashed = 3
    SparseDotted = 4


# Extended Line Style that utiizes either the predefined Lightweight Charts Enums, or a pixel array to define stoke lengths & patterns
type LineStyleEXT = LineStyle | list[int]


class CanvasLineCap(StrEnum):
    "HTML Canvas Line Cap Types"

    Butt = auto()
    Round = auto()
    Square = auto()


class CanvasLineJoin(StrEnum):
    "HTML Canvas Line Join Types"

    Round = auto()
    Bevel = auto()
    Miter = auto()


class CanvasTextAlign(StrEnum):
    "HTML Text Align Types"

    Left = auto()
    Right = auto()
    Center = auto()
    Start = auto()
    End = auto()


class CanvasTextBaseline(StrEnum):
    "HTML Text Baseline Types"

    Top = auto()
    Hanging = auto()
    Middle = auto()
    Alphabetic = auto()
    Ideographic = auto()
    Bottom = auto()


class LastPriceAnimationMode(IntEnum):
    """
    Represents the type of the last price animation for series such as area or line.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/enums/LastPriceAnimationMode
    """

    Disabled = 0
    Continuous = 1
    OnDataUpdate = 2


# endregion


@dataclass(slots=True)
class SeriesOptionsCommon:
    """
    Represents options common for all types of series. All options may be Optional, but the
    Lightweight Charts API does assign default values to each. See the Docs for default values
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/SeriesOptionsCommon
    """

    title: Optional[str] = None
    visible: Optional[bool] = None
    lastValueVisible: Optional[bool] = None
    priceScaleId: Optional[str] = None

    priceLineVisible: Optional[bool] = None
    priceLineWidth: Optional[float] = None
    priceLineColor: Optional[JS_Color] = None
    priceLineStyle: Optional[LineStyle] = None
    priceLineSource: Optional[PriceLineSource] = None
    priceFormat: Optional[PriceFormat_T] = None

    # BaseLine is for 'IndexTo' and Percent Modes
    baseLineVisible: Optional[bool] = None
    baseLineWidth: Optional[float] = None
    baseLineStyle: Optional[LineStyle] = None
    baseLineColor: Optional[JS_Color] = None
    autoscaleInfoProvider: Optional[j_func] = None

    @property
    def as_dict(self) -> dict:
        "The Object in dictionary form with 'Nones' Dropped."
        return asdict(self, dict_factory=lambda x: {k: v for (k, v) in x if v is not None})  # Drop Nones

    @classmethod
    def from_dict(cls, obj: dict) -> Self:
        "Create an instance from a dict ignoring extraneous params"
        params = signature(cls).parameters
        return cls(**{k: v for k, v in obj.items() if k in params})


# region ----------------------------- Single Value SeriesOptions ------------------------------ #


@dataclass(slots=True)
class LineStyleOptions(SeriesOptionsCommon):
    """
    Represents style options for a line series.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/LineStyleOptions
    """

    color: Optional[JS_Color] = None
    lineVisible: Optional[bool] = None
    lineWidth: Optional[int] = None
    lineType: Optional[LineType] = None
    lineStyle: Optional[LineStyle] = None

    pointMarkersRadius: Optional[int] = None
    pointMarkersVisible: Optional[bool] = None

    crosshairMarkerVisible: Optional[bool] = None
    crosshairMarkerRadius: Optional[int] = None
    crosshairMarkerBorderWidth: Optional[int] = None
    crosshairMarkerBorderColor: Optional[JS_Color] = None
    crosshairMarkerBackgroundColor: Optional[JS_Color] = None
    lastPriceAnimation: Optional[LastPriceAnimationMode] = None


@dataclass(slots=True)
class HistogramStyleOptions(SeriesOptionsCommon):
    """
    Represents style options for a histogram series.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/HistogramStyleOptions
    """

    base: Optional[float] = None
    color: Optional[JS_Color] = None


@dataclass(slots=True)
class AreaStyleOptions(SeriesOptionsCommon):
    """
    Represents style options for an area series.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/AreaStyleOptions
    """

    lineColor: Optional[JS_Color] = None
    lineStyle: Optional[LineStyle] = None
    lineType: Optional[LineType] = None
    lineWidth: Optional[float] = None
    lineVisible: Optional[bool] = None

    topColor: Optional[JS_Color] = None
    bottomColor: Optional[JS_Color] = None
    invertFilledArea: Optional[bool] = None

    pointMarkersRadius: Optional[int] = None
    pointMarkersVisible: Optional[bool] = None

    crosshairMarkerVisible: Optional[bool] = None
    crosshairMarkerRadius: Optional[int] = None
    crosshairMarkerBorderWidth: Optional[int] = None
    crosshairMarkerBorderColor: Optional[JS_Color] = None
    crosshairMarkerBackgroundColor: Optional[JS_Color] = None
    lastPriceAnimation: Optional[LastPriceAnimationMode] = None


@dataclass(slots=True)
class BaseValuePrice:
    """
    Represents a type of priced base value of baseline series type.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/BaseValuePrice
    """

    price: float
    type: Literal["price"] = field(default="price", init=False)


@dataclass(slots=True)
class BaselineStyleOptions(SeriesOptionsCommon):
    """
    Represents style options for a baseline series.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/BaselineStyleOptions
    """

    baseValue: Optional[BaseValuePrice] = None
    lineVisible: Optional[bool] = None
    lineWidth: Optional[float] = None
    lineType: Optional[LineType] = None
    lineStyle: Optional[LineStyle] = None

    topLineColor: Optional[JS_Color] = None
    topFillColor1: Optional[JS_Color] = None
    topFillColor2: Optional[JS_Color] = None

    bottomLineColor: Optional[JS_Color] = None
    bottomFillColor1: Optional[JS_Color] = None
    bottomFillColor2: Optional[JS_Color] = None

    pointMarkersRadius: Optional[int] = None
    pointMarkersVisible: Optional[bool] = None

    crosshairMarkerVisible: Optional[bool] = None
    crosshairMarkerRadius: Optional[int] = None
    crosshairMarkerBorderColor: Optional[str] = None
    crosshairMarkerBorderWidth: Optional[int] = None
    crosshairMarkerBackgroundColor: Optional[str] = None
    lastPriceAnimation: Optional[LastPriceAnimationMode] = None


# endregion

# region ------------------------------ OHLC Value Series Options ------------------------------ #


@dataclass(slots=True)
class BarStyleOptions(SeriesOptionsCommon):
    """
    Represents style options for a bar series.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/BarStyleOptions
    """

    thinBars: Optional[bool] = None
    openVisible: Optional[bool] = None
    upColor: Optional[JS_Color] = None
    downColor: Optional[JS_Color] = None


@dataclass(slots=True)
class CandlestickStyleOptions(SeriesOptionsCommon):
    """
    Represents style options for a candlestick series.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/CandlestickStyleOptions
    """

    upColor: Optional[JS_Color] = None
    downColor: Optional[JS_Color] = None

    borderVisible: Optional[bool] = None
    borderColor: Optional[JS_Color] = None
    borderUpColor: Optional[JS_Color] = None
    borderDownColor: Optional[JS_Color] = None

    wickVisible: Optional[bool] = None
    wickColor: Optional[JS_Color] = None
    wickUpColor: Optional[JS_Color] = None
    wickDownColor: Optional[JS_Color] = None


@dataclass(slots=True)
class RoundedCandleStyleOptions(SeriesOptionsCommon):
    """
    Represents style options for a rounded candlestick series.
    """

    upColor: Optional[JS_Color] = None
    downColor: Optional[JS_Color] = None

    wickVisible: Optional[bool] = None
    wickColor: Optional[JS_Color] = None
    wickUpColor: Optional[JS_Color] = None
    wickDownColor: Optional[JS_Color] = None


# endregion

AnySeriesOptions: TypeAlias = (
    SeriesOptionsCommon
    | LineStyleOptions
    | HistogramStyleOptions
    | AreaStyleOptions
    | BaselineStyleOptions
    | BarStyleOptions
    | CandlestickStyleOptions
    | RoundedCandleStyleOptions
)

# endregion
