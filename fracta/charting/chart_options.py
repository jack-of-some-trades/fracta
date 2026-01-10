"""Dataclass representations of Lightweight-Charts' scale and chart options"""

from dataclasses import dataclass, field
from enum import IntEnum, auto
from typing import Literal, Optional, TypeAlias, Union

from .series_options import LineStyle

from ..types import JS_Color, j_func

# pylint: disable=invalid-name

# region  ---- ---- ---- ---- ---- ---- Price Scale Options  ---- ---- ---- ---- ---- ---- #


class PriceScaleMode(IntEnum):
    """
    Represents the price scale mode.
    Docs:https://tradingview.github.io/lightweight-charts/docs/api/enums/PriceScaleMode
    """

    Normal = 0
    Logarithmic = 1
    Percentage = 2
    IndexedTo100 = 3


@dataclass(slots=True)
class PriceScaleMargins:
    """
    Defines margins of the price scale.
    Docs:https://tradingview.github.io/lightweight-charts/docs/api/interfaces/PriceScaleMargins
    """

    top: Optional[float] = None
    bottom: Optional[float] = None


@dataclass(slots=True)
class OverlayPriceScaleOptions:
    """
    Structure that describes overlay price scale options.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/PriceScaleOptions
    """

    invertScale: Optional[bool] = None
    ticksVisible: Optional[bool] = None

    minimumWidth: Optional[int] = None
    mode: Optional[PriceScaleMode] = None
    scaleMargins: Optional[PriceScaleMargins] = None

    borderVisible: Optional[bool] = None
    borderColor: Optional[JS_Color] = None

    alignLabels: Optional[bool] = None
    entireTextOnly: Optional[bool] = None
    textColor: Optional[JS_Color] = None


@dataclass(slots=True)
class PriceScaleOptions(OverlayPriceScaleOptions):
    """
    Structure that describes visible price scale options.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/PriceScaleOptions
    """

    visible: Optional[bool] = None
    autoScale: Optional[bool] = None


# endregion

# region ---- ---- ---- ---- ---- ---- Grid Options ---- ---- ---- ---- ---- ----


@dataclass(slots=True)
class GridLineOptions:
    """
    Grid line options.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/GridLineOptions
    """

    visible: Optional[bool] = None
    style: Optional[LineStyle] = None
    color: Optional[JS_Color] = None


@dataclass(slots=True)
class GridOptions:
    """
    Structure describing grid options.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/GridOptions
    """

    vertLines: Optional[GridLineOptions] = None
    horzLines: Optional[GridLineOptions] = None


# endregion

# region ---- ---- ---- ---- ---- ---- Handle Scale Options ---- ---- ---- ---- ---- ----


@dataclass(slots=True)
class AxisDoubleClickOptions:
    """
    Represents options for how the time and price axes react to mouse double click.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/AxisDoubleClickOptions
    """

    time: Optional[bool] = None
    price: Optional[bool] = None


@dataclass(slots=True)
class AxisPressedMouseMoveOptions:
    """
    Represents options for how the time and price axes react to mouse movements.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/AxisPressedMouseMoveOptions
    """

    time: Optional[bool] = None
    price: Optional[bool] = None


@dataclass(slots=True)
class HandleScaleOptions:
    """
    Represents options for how the chart is scaled by the mouse and touch gestures.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/HandleScrollOptions
    """

    mouseWheel: Optional[bool] = None
    pinch: Optional[bool] = None
    axisPressedMouseMove: Optional[Union[AxisPressedMouseMoveOptions, bool]] = None
    axisDoubleClickReset: Optional[Union[AxisDoubleClickOptions, bool]] = None


# endregion

# region ---- ---- ---- ---- ---- ---- Misc Non-Nested Options ---- ---- ---- ---- ---- ----


@dataclass(slots=True)
class KineticScrollOptions:
    """
    Represents options for enabling or disabling kinetic scrolling with mouse and touch gestures.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/KineticScrollOptions
    """

    touch: Optional[bool] = None
    mouse: Optional[bool] = None


@dataclass(slots=True)
class HandleScrollOptions:
    """
    Represents options for how the chart is scrolled by the mouse and touch gestures.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/HandleScrollOptions
    """

    mouse_wheel: Optional[bool] = None
    pressed_mouse_move: Optional[bool] = None
    horz_touch_drag: Optional[bool] = None
    vert_touch_drag: Optional[bool] = None


@dataclass(slots=True)
class TrackingModeOptions:
    """
    Represents options for the tracking mode's behavior.
    0 == OnTouchEnd, 1 == OnNextTap

    Mobile users will not have the ability to see the values/dates like they do on desktop.
    To see it, they should enter the tracking mode. The tracking mode will deactivate the scrolling
    and make it possible to check values and dates.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/TrackingModeOptions
    """

    exitMode: Optional[Literal[0, 1]] = None


@dataclass(slots=True)
class LocalizationOptionsBase:
    """
    Represents basic localization options.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/LocalizationOptionsBase
    """

    locale: Optional[str] = None
    price_formatter: Optional[j_func] = None
    percentage_formatter: Optional[j_func] = None


@dataclass(slots=True)
class WatermarkOptions:
    """
    ** Out of date ** This refers to v4 Watermarks. Migration needed once Watermarks can be applied to the screen.
    ORM of Lightweight Charts API 'WatermarkOptions'
    Default Values Match Original API's Default Values.
    Original Object: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/WatermarkOptions
    Tutorial: https://tradingview.github.io/lightweight-charts/tutorials/how_to/watermark
    """

    color: Optional[JS_Color] = None
    visible: Optional[bool] = None
    text: Optional[str] = None
    fontSize: Optional[int] = None
    fontStyle: Optional[str] = None
    fontFamily: Optional[str] = None
    horzAlign: Optional[Literal["left", "center", "right"]] = None
    vertAlign: Optional[Literal["bottom", "top", "center"]] = None


# endregion

# region ---- ---- ---- ---- ---- ---- Crosshair Options ---- ---- ---- ---- ---- ----


class CrosshairMode(IntEnum):
    """
    Represents the crosshair mode.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/enums/CrosshairMode
    Tutorial: https://tradingview.github.io/lightweight-charts/tutorials/customization/crosshair#crosshair-mode
    """

    Normal = 0
    Magnet = 1
    Hidden = 2


@dataclass(slots=True)
class CrosshairLineOptions:
    """
    Structure describing a crosshair line (vertical or horizontal).
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/CrosshairLineOptions
    """

    visible: Optional[bool] = None
    width: Optional[int] = None
    color: Optional[JS_Color] = None
    style: Optional[LineStyle] = None

    labelVisible: Optional[bool] = None
    labelBackgroundColor: Optional[JS_Color] = None


@dataclass(slots=True)
class CrosshairOptions:
    """
    Structure describing crosshair options.
    Docs:https://tradingview.github.io/lightweight-charts/docs/api/interfaces/CrosshairOptions
    """

    mode: Optional[CrosshairMode] = None
    vertLine: Optional[CrosshairLineOptions] = None
    horzLine: Optional[CrosshairLineOptions] = None


# endregion

# region ---- ---- ---- ---- ---- ---- Horizontal Scale Options ---- ---- ---- ---- ---- ----


@dataclass(slots=True)
class HorzScaleOptions:
    """
    Options for the time scale; the horizontal scale at the bottom of the chart that displays the time of data.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/HorzScaleOptions
    """

    visible: Optional[bool] = None
    timeVisible: Optional[bool] = None
    fixLeftEdge: Optional[bool] = None
    fixRightEdge: Optional[bool] = None

    barSpacing: Optional[int] = None
    rightOffset: Optional[int] = None
    minBarSpacing: Optional[float] = None
    minimumHeight: Optional[int] = None
    shiftVisibleRangeOnNewBar: Optional[bool] = None
    lockVisibleTimeRangeOnResize: Optional[bool] = None
    allowShiftVisibleRangeOnWhitespaceReplacement: Optional[bool] = None

    uniformDistribution: Optional[bool] = None
    rightBarStaysOnScroll: Optional[bool] = None

    allowBoldLabels: Optional[bool] = None
    secondsVisible: Optional[bool] = None
    borderVisible: Optional[bool] = None
    borderColor: Optional[JS_Color] = None

    ticksVisible: Optional[bool] = None
    tickMarkMaxCharacterLength: Optional[int] = None


@dataclass(slots=True)
class TimeScaleOptions(HorzScaleOptions):
    """
    Horizontal Scale Options with the addition of an Optional TickMarkFormatter function.

    For More Information on the TickMarkFormatter function Inputs & Outputs see:
    https://tradingview.github.io/lightweight-charts/docs/api#tickmarkformatter
    """

    tickmarkFormatter: Optional[j_func] = None


# endregion

# region ---- ---- ---- ---- Background Layout Options and Sub-Objects ---- ---- ---- ----


@dataclass(slots=True)
class SolidColor:
    """
    Represents a solid color.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/SolidColor
    """

    type: Literal["solid"] = field(default="solid", init=False)
    color: Optional[JS_Color] = None


@dataclass(slots=True)
class VerticalGradientColor:
    """
    Represents a vertical gradient of two colors.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/VerticalGradientColor
    """

    type: Literal["gradient"] = field(default="gradient", init=False)
    topColor: Optional[JS_Color] = None
    bottomColor: Optional[JS_Color] = None


Background: TypeAlias = SolidColor | VerticalGradientColor


@dataclass(slots=True)
class LayoutOptions:
    """
    Represents layout options.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/LayoutOptions
    """

    background: Optional[Background] = None
    textColor: Optional[JS_Color] = None
    fontSize: Optional[int] = None
    fontFamily: Optional[str] = None
    attributionLogo: Optional[bool] = None


# endregion


# region ---- ---- ---- ---- ---- Cumulative Chart Options Object ---- ---- ---- ---- ----


@dataclass(slots=True)
class ChartOptionsBase:
    """
    Represents common chart options
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/ChartOptionsBase
    """

    width: Optional[int] = None
    height: Optional[int] = None
    autoSize: Optional[bool] = None
    watermark: Optional[WatermarkOptions] = None
    layout: Optional[LayoutOptions] = None
    leftPriceScale: Optional[PriceScaleOptions] = None
    rightPriceScale: Optional[PriceScaleOptions] = None
    overlayPriceScales: Optional[OverlayPriceScaleOptions] = None
    timeScale: Optional[HorzScaleOptions] = None
    crosshair: Optional[CrosshairOptions] = None
    grid: Optional[GridOptions] = None
    handleScale: Optional[Union[HandleScaleOptions, bool]] = None
    handleScroll: Optional[Union[HandleScrollOptions, bool]] = None
    kineticScroll: Optional[KineticScrollOptions] = None
    trackingMode: Optional[TrackingModeOptions] = None
    localization: Optional[LocalizationOptionsBase] = None


@dataclass(slots=True)
class TimeChartOptions(ChartOptionsBase):
    """
    Chart Options for a Time Based Chart.
    Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/TimeChartOptions
    """

    timeScale: Optional[TimeScaleOptions] = None


# endregion
