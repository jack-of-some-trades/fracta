"""
Fracta is a locally executed Web-App constructed from Python and Typescript.
The Web-App is Launched via PyWebView and builds heavily on TradingView's Lightweight Charts API.

The Primary Goal is to offer a means to Display and Manipulate timeseries data from any source,
static or dynamic, without restriction.

https://github.com/jack-of-some-trades/fracta

TradingView Lightweight Charts™
Copyright (с) 2023 TradingView, Inc. https://www.tradingview.com/
"""

from importlib.metadata import version, metadata, PackageNotFoundError

try:
    __version__ = version("fracta")
    __description__ = metadata("fracta")["Summary"]
except PackageNotFoundError:
    __version__ = "unknown"
    __description__ = "Python & Typescript based web-app for Viewing & Manipulating Timeseries Data."

import logging
from .util import LazyModule

from .types import TF, Color, JS_Color, Ticker
from .window import Window, Container, Frame, Layouts
from .charting import *
from .charting.indicator import Indicator, IndicatorOptions
from .charting.series_dtypes import (
    AnyBasicData,
    WhitespaceData,
    SingleValueData,
    OhlcData,
    LineData,
    AreaData,
    HistogramData,
    BaselineData,
    BarData,
    CandlestickData,
    RoundedCandleData,
    AnyBasicSeriesType,
)
from . import indicators
from . import broker_apis
from .server import FractaServer, ServerParams, ServerProtocol


__all__ = (
    "Window",
    "Container",
    "Frame",
    "ChartingFrame",
    "FractaServer",
    #
    # Types
    "TF",
    "Color",
    "JS_Color",
    "Ticker",
    "ServerParams",
    "ServerProtocol",
    "Indicator",
    "IndicatorOptions",
    #
    # Data DataClasses
    "AnyBasicData",
    "WhitespaceData",
    "SingleValueData",
    "OhlcData",
    "LineData",
    "AreaData",
    "HistogramData",
    "BaselineData",
    "BarData",
    "CandlestickData",
    "RoundedCandleData",
    # Enums
    "Layouts",
    "SeriesType",
    "AnyBasicSeriesType",
    #
    # SubModules,
    "LazyModule",
    "indicators",
    "broker_apis",
)

_LOG_LVL = logging.WARNING
# _LOG_LVL = logging.INFO
# _LOG_LVL = logging.DEBUG

logger = logging.getLogger("fracta_log")
handler = logging.StreamHandler(None)
formatter = logging.Formatter("[Fracta] - [.\\%(filename)s Line: %(lineno)d] - %(levelname)s: %(message)s")
handler.setFormatter(formatter)
logger.addHandler(handler)
logger.setLevel(_LOG_LVL)
