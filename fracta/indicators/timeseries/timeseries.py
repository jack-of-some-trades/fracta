"""Series Indicator that receives raw Timeseries Data and filters it"""

from logging import getLogger
from dataclasses import dataclass
from typing import (
    TYPE_CHECKING,
    Dict,
    Optional,
    Any,
    get_args,
)

import pandas as pd
from numpy import nan

from fracta import (
    Color,
    Ticker,
    TF,
    AnyBasicSeriesType,
    HistogramData,
    SeriesType,
    AnyBasicData,
    SingleValueData,
)
from .timeseries_dfs import LTF_DF, TimeseriesDF, WhitespaceDF
from ...charting import series_common as sc
from ...charting.indicator import (
    Indicator,
    IndicatorOptions,
    output_property,
    default_output_property,
    param,
)

if TYPE_CHECKING:
    from ...charting.charting_frame import ChartingFrame


logger = getLogger("fracta_log")


@dataclass(slots=True)
class BarState:
    """
    Dataclass object that holds various information about the current bar.
    """

    index: int = -1
    time: pd.Timestamp = pd.Timestamp(0)
    timestamp: pd.Timestamp = pd.Timestamp(0)
    time_close: pd.Timestamp = pd.Timestamp(0)
    time_length: pd.Timedelta = pd.Timedelta(0)

    open: float = nan
    high: float = nan
    low: float = nan
    close: float = nan
    value: float = nan
    volume: float = nan
    ticks: float = nan

    is_ext: bool = False
    is_new: bool = False
    is_ohlc: bool = False
    is_single_value: bool = False


G1 = "Display Series"
G2 = "Volume Series"
I1 = "a"
I2 = "b"


# pylint: disable=arguments-differ
@dataclass
class SeriesIndicatorOptions(IndicatorOptions):
    "Indicator Options for a Series"

    series_type: SeriesType = param(
        SeriesType.Rounded_Candle,
        "Series Type",
        G1,
        options=[t for t in SeriesType if t not in get_args(AnyBasicSeriesType)],
    )

    vol_price_axis: str = param("vol", "Price Axis", G2, autosend=False, tooltip="Press Enter to Commit Change")
    vol_scale_invert: bool = param(False, "Invert", G2, I1)
    vol_scale_margin: int = param(75, "Scale Margin", G2, I1, min=0, max=100)

    color_vol: bool = param(True, "Color Vol", G2, I2)
    up_color: Color = param(Color.from_hex("#26a69a"), "Up ", G2, I2)
    down_color: Color = param(Color.from_hex("#ef5350"), "Down ", G2, I2)
    vol_opacity: int = param(
        50,
        "Opacity",
        G2,
        min=0,
        max=100,
        step=5,
        slider=True,
    )


class Timeseries(Indicator):
    """
    Draws a Series Object onto the Screen. Expands SeriesCommon behavior by filtering & Aggregating
    data, Creating a Whitespace Expansion Series, & Allowing the ability to change the series type.

    Other Indicators should subscribe to this object's bar updates as a filtered form of data.
    """

    __special_id__ = "XyzZy"
    __options__ = SeriesIndicatorOptions
    __registered__ = True

    def __init__(
        self,
        parent: "ChartingFrame",
        opts: Optional[SeriesIndicatorOptions] = None,
        *,
        js_id: Optional[str] = None,
        display_name: str = "",
    ) -> None:
        if js_id == self.__special_id__:
            super().__init__(parent, js_id=js_id, display_name="Main-Series")
        else:
            super().__init__(parent, js_id=js_id, display_name=display_name)

        # Dunder to allow specific permissions to the main source of a data for a Frame.
        # Because _ids can't be duplicated and this _id is reserved on frame creation,
        # the user can never accidentally set the _js_id to be __special_id__.
        self.__frame_primary_src__ = self._js_id == self.parent_frame.indicators.prefix + Timeseries.__special_id__

        if opts is None:
            opts = SeriesIndicatorOptions()

        if self.__frame_primary_src__:
            self.parent_frame.__set_displayed_series_type__(opts.series_type)

        self.opts = opts
        self.timeframe = None
        self.ticker = Ticker("FRACTA")
        self._bar_state: Optional[BarState] = None

        # Cached Volume colors w/ the appropriate opacity
        self.vol_up_color = Color.from_color(opts.up_color, a=opts.vol_opacity / 100)
        self.vol_down_color = Color.from_color(opts.down_color, a=opts.vol_opacity / 100)

        self.main_data: Optional[TimeseriesDF] = None
        self.ltf_data: Dict[TF, LTF_DF] = {}
        self.whitespace_data: Optional[WhitespaceDF] = None

        self.display_series = sc.SeriesCommon(self, opts.series_type, name="Display-Series")
        self.vol_series = sc.SeriesCommon(
            self,
            SeriesType.Histogram,
            name="Vol-Series",
            options=sc.HistogramStyleOptions(color="#6666667F"),
            arg_map=sc.ArgMap(value="volume", color="vol_color"),
        )
        self.update_options(opts)
        self.init_menu(opts)

    def request_timeseries(self, ticker: Optional[Ticker], timeframe: Optional[TF] = None):
        "Request that this Series change it's symbol and/or timeframe to the one given."
        self.clear_data()

        if ticker is not None:
            self.ticker = ticker
            if self.__frame_primary_src__:
                self.parent_frame.__set_displayed_symbol__(ticker)

        if timeframe is not None:
            self.timeframe = timeframe
            if self.__frame_primary_src__:
                self.parent_frame.__set_displayed_timeframe__(timeframe)

        if self.ticker is not None and self.timeframe is not None:
            self.events.data_request(
                ticker=self.ticker,
                timeframe=self.timeframe,
                rsp_kwargs={"series": self},
            )
            self.events.open_socket(ticker=self.ticker, series=self)

    # region ------------------ Abstract Method Implementations ------------------

    def update_options(self, opts: SeriesIndicatorOptions) -> bool:
        if opts.series_type != self.opts.series_type:
            self.change_series_type(opts.series_type)

        if (
            opts.up_color != self.opts.up_color
            or opts.down_color != self.opts.down_color
            or opts.vol_opacity != self.opts.vol_opacity
            or opts.color_vol != self.opts.color_vol
        ):
            self.vol_up_color = Color.from_color(opts.up_color, a=opts.vol_opacity / 100)
            self.vol_down_color = Color.from_color(opts.down_color, a=opts.vol_opacity / 100)
            # Need to update bool before Coloring Vol Series
            self.opts.color_vol = opts.color_vol
            self._set_vol_series()

        self.vol_series.apply_options(
            sc.SeriesOptionsCommon(
                priceScaleId=opts.vol_price_axis,
                priceFormat=sc.PriceFormat("volume"),
            )
        )
        if opts.vol_scale_invert:
            self.vol_series.apply_scale_options(
                {
                    "scaleMargins": {"top": 0, "bottom": opts.vol_scale_margin / 100},
                    "invertScale": True,
                }
            )

        else:
            self.vol_series.apply_scale_options(
                {
                    "scaleMargins": {"top": opts.vol_scale_margin / 100, "bottom": 0},
                    "invertScale": False,
                }
            )

        self.opts = opts
        return False

    def set_data(
        self,
        data: pd.DataFrame | list[dict[str, Any]],
        *_,
        **__,
    ):
        "Sets the main source of data for this Frame"
        if self.main_data is not None:
            # Ensure Data is clear. Most of the time it already will be.
            self.clear_data()

        if self.__frame_primary_src__:
            self.parent_frame.__set_displayed_symbol__(self.ticker)

        # ---------------- Initialize Series DataFrame ----------------
        if not isinstance(data, pd.DataFrame):
            data = pd.DataFrame(data)
        self.main_data = TimeseriesDF(data, self.ticker.exchange)

        # ---------------- Clear & Return on Bad Data ----------------
        if self.main_data.timeframe.period == "E" or self.main_data.data_type == SeriesType.WhitespaceData:
            self.main_data = None
            return
        # Ensure timeframe matches data timeframe in case the data given doesn't match
        # the timeframe that this was set to somehow
        self.timeframe = self.main_data.timeframe

        # ---------------- Update Displayed Series Objects with Data ----------------
        self._init_bar_state()
        self.display_series.set_data(self.main_data.df)
        self._set_vol_series()

        # ---------------- Set the frame's Whitespace Series if needed ----------------
        if self.__frame_primary_src__:
            self.whitespace_data = WhitespaceDF(self.main_data)
            self.parent_frame.__set_whitespace__(
                self.whitespace_data.df,
                SingleValueData(self.main_data.curr_bar_open_time, 0),
            )

        if self.__frame_primary_src__:
            # Only do this once everything else has completed and not Error'd.
            self.parent_frame.autoscale_timeaxis()
            self.parent_frame.__set_displayed_timeframe__(self.main_data.timeframe)

        # ---------------- Inform all Indicators that New Data is Available ----------------
        self._watcher.set = True
        self._notify_observers_set()

    def update_data(self, data_update: AnyBasicData, *_, accumulate=False, **__):
        """
        Updates the prexisting Frame's Primary Dataframe. The data point's time should
        be equal to or greater than the last data point otherwise this will have no effect.

        Can Accept WhitespaceData, SingleValueData, and OhlcData.
        Function will auto detect if this is a tick or bar update.
        When Accumulate is set to True, tick updates will accumulate volume,
        otherwise the last volume will be overwritten.
        """
        # Ignoring 4 Operator Errors, it's a false alarm since WhitespaceData.__post_init__()
        # Will Always convert 'data.time' to a compatible pd.Timestamp.
        if self.main_data is None or data_update.time < self.main_data.curr_bar_open_time:  # type: ignore
            return

        data_update = self.main_data.conform_timezone(data_update)

        # ------------------ Determine if Data Should be Aggregated or Appended ------------------
        new_bar = False
        if data_update.time < self.main_data.next_bar_time:  # type: ignore
            # Update the last bar (Aggregate)
            display_data = self.main_data.update_curr_bar(data_update, accumulate=accumulate)
        else:
            # Create new Bar (Append)
            if data_update.time != self.main_data.next_bar_time:
                # Update given is a new bar, but not the expected time
                # Ensure it fits the data's time interval e.g. 12:00:0071 -> 12:00:00
                # TODO: Update the time calc. This will error for HTF when timedelta is invalid
                time_delta = data_update.time - self.main_data.next_bar_time  # type: ignore
                data_update.time -= time_delta % self.main_data.timedelta  # type: ignore

            curr_bar_time = self.main_data.curr_bar_open_time
            display_data = self.main_data.append_new_bar(data_update)
            new_bar = True

            # --------------------- Manage Whitespace Series ---------------------
            if self.__frame_primary_src__ and self.whitespace_data is not None:
                if data_update.time != (expected_time := self.whitespace_data.next_timestamp(curr_bar_time)):
                    # New Data Jumped more than expected, Replace Whitespace Data So
                    # There are no unnecessary gaps.
                    logger.info(
                        "Whitespace_DF Predicted incorrectly. Expected_time: %s, Recieved_time: %s",
                        expected_time,
                        data_update.time,
                    )
                    self.whitespace_data = WhitespaceDF(self.main_data)
                    self.parent_frame.__set_whitespace__(
                        self.whitespace_data.df,
                        SingleValueData(self.main_data.curr_bar_open_time, 0),
                    )
                else:
                    # Lengthen Whitespace Data to keep 500bar Buffer
                    self.parent_frame.__update_whitespace__(
                        self.whitespace_data.extend(),
                        SingleValueData(self.main_data.curr_bar_open_time, 0),
                    )

        # ---------------------- Update Displayed Series and BarState Object ----------------------
        self._update_bar_state(pd.Timestamp(data_update.time), new_bar)
        self.display_series.update_data(display_data)
        self._update_vol_series()

        # --------------------- Propogate the Data Update to other Indicators ---------------------
        self._watcher.reset_updated_state()
        self._watcher.updated = True
        self._notify_observers_update()

    def clear_data(self):
        "Clears the data in memory and on the screen, Closes out An open Socket if one exists"
        self.main_data = None
        self._bar_state = None

        if self.__frame_primary_src__:
            self.whitespace_data = None
            self.parent_frame.__clear_whitespace__()

        self.events.close_socket(series=self)

        super().clear_data()

        # Notify Observers to propagate the Data Clear Event
        self._notify_observers_clear()

    # endregion

    # region ------------------ Set & Update Sub-Routines ------------------

    def _init_bar_state(self):
        if self.main_data is None:
            return

        df = self.main_data.df
        col_names = self.main_data.df.columns

        self._bar_state = BarState(
            index=len(self.main_data.df) - 1,
            time=self.main_data.curr_bar_open_time,
            timestamp=self.main_data.curr_bar_open_time,
            time_close=self.main_data.curr_bar_close_time,
            time_length=self.main_data.timedelta,
            open=(df.iloc[-1]["open"] if "open" in col_names else nan),
            high=(df.iloc[-1]["high"] if "high" in col_names else nan),
            low=(df.iloc[-1]["low"] if "low" in col_names else nan),
            close=(df.iloc[-1]["close"] if "close" in col_names else nan),
            value=(df.iloc[-1]["value"] if "value" in col_names else nan),
            volume=(df.iloc[-1]["volume"] if "volume" in col_names else nan),
            ticks=(df.iloc[-1]["ticks"] if "ticks" in col_names else nan),
            # is_ext=self.main_data.ext, # TODO: Implement time check
            is_new=True,
            is_single_value="value" in col_names,
            is_ohlc="close" in col_names,
        )

    def _update_bar_state(self, current_timestamp: pd.Timestamp, is_new: bool):
        if self.main_data is None or self._bar_state is None:
            return

        df = self.main_data.df
        col_names = self.main_data.df.columns

        self._bar_state.index = len(self.main_data.df) - 1
        self._bar_state.time = self.main_data.curr_bar_open_time
        self._bar_state.timestamp = current_timestamp
        self._bar_state.time_close = self.main_data.curr_bar_close_time
        self._bar_state.time_length = self.main_data.timedelta
        self._bar_state.open = float(df.iloc[-1]["open"] if "open" in col_names else nan)
        self._bar_state.high = float(df.iloc[-1]["high"] if "high" in col_names else nan)
        self._bar_state.low = float(df.iloc[-1]["low"] if "low" in col_names else nan)
        self._bar_state.close = float(df.iloc[-1]["close"] if "close" in col_names else nan)
        self._bar_state.value = float(df.iloc[-1]["value"] if "value" in col_names else nan)
        self._bar_state.volume = float(df.iloc[-1]["volume"] if "volume" in col_names else nan)
        self._bar_state.ticks = float(df.iloc[-1]["ticks"] if "ticks" in col_names else nan)
        # self._bar_state.is_ext=self.main_data.ext, TODO: Implement Time check
        self._bar_state.is_new = is_new
        # self._bar_state.is_single_value ## Constant
        # self._bar_state.is_ohlc ## Constant

    def _set_vol_series(self):
        if self.main_data is not None and "volume" in self.main_data.columns:
            if self.opts.color_vol and set(["open", "close"]).issubset(self.main_data.columns):
                # Generate a Color Series for the Volume Histogram if we can
                vol_color = self.main_data.df["close"] >= self.main_data.df["open"]
                self.main_data.df["vol_color"] = vol_color.replace(
                    {True: self.vol_up_color, False: self.vol_down_color}
                )
            elif "vol_color" in self.main_data.columns:
                self.main_data.df.drop(columns="vol_color", inplace=True)

            # Color Doesn't Need to exist to update the Series
            self.vol_series.set_data(self.main_data.df)

    def _update_vol_series(self):
        if self._bar_state is None:
            return

        if not self.opts.color_vol or self._bar_state.close is nan or self._bar_state.open is nan:
            color = None
        elif self._bar_state.close > self._bar_state.open:
            color = self.vol_up_color
        else:
            color = self.vol_down_color

        self.vol_series.update_data(HistogramData(self._bar_state.time, self._bar_state.volume, color=color))

    # endregion

    # region ------------------ Lower-Timeframe Support ------------------

    def request_ltf(self, timeframe: TF):
        "Request that a Lower Timeframe of data be retrieved for calculation"
        raise NotImplementedError

    def release_ltf(self, timeframe: TF):
        "Relinquish the need for this series to track a specific lower timeframe"
        raise NotImplementedError

    # endregion

    def change_series_type(self, series_type: SeriesType | str, update_ui_menu=False):
        "Change the Series Type of the main dataset"
        series_type = SeriesType(series_type)
        # Check Input
        if series_type == SeriesType.WhitespaceData:
            return
        if series_type == SeriesType.OHLC_Data:
            series_type = SeriesType.Candlestick
        if series_type == SeriesType.SingleValueData:
            series_type = SeriesType.Line
        if self.main_data is None or self.opts.series_type == series_type:
            return

        # Set. No Data renaming needed, that is handeled when converting to json
        self.opts.series_type = series_type
        self.display_series.change_series_type(series_type, self.main_data.df)

        # Update window display if necessary
        if self.__frame_primary_src__:
            self.parent_frame.__set_displayed_series_type__(self.opts.series_type)

        # This function can be called by the window controls. If it is, update the menu since
        # that isn't where this change originated from and thus is out of date
        if update_ui_menu:
            self.update_menu(self.opts)

    def bar_time(self, index: int) -> pd.Timestamp:
        """
        Get the timestamp at a given bar index. Negative indices are valid and will start
        at the last bar time.

        The returned timestamp will always be bound to the limits of the underlying dataset
        e.g. [FirstBarTime, LastBarTime]. If no underlying data exists 1970-01-01[UTC] is returned.

        The index may be up to 500 bars into the future, though this is only guaranteed to be the
        desired timestamp if this Series Indicator is the Main Series Data for it's parent Frame.
        Depending on the data received, Future Timestamps may not always remain valid.
        """
        if self.main_data is None:
            logger.warning("Requested Bar-Time prior setting series data!")
            return pd.Timestamp(0)

        if self.whitespace_data is not None:
            # Find index given main dataset and Whitespace Projection
            total_len = len(self.main_data.df) + len(self.whitespace_data.df)
            if index > total_len - 1:
                logger.warning("Requested Bar-Time beyond 500 Bars in the Future.")
                return self.whitespace_data.df.index[-1]
            elif index < -(len(self.main_data.df) - 1):
                # i.e. Less than the max possible negative index
                logger.warning("Requested Bar-Time prior to start of the dataset.")
                return self.main_data.df.index[0]
            else:
                if index < len(self.main_data.df):
                    return self.main_data.df.index[index]
                else:
                    # Whitespace df grows as data is added hence funky iloc index.
                    return self.whitespace_data.df["time"].iloc[(index - len(self.main_data.df)) - 500]
        else:
            # Series has no Whitespace projection
            if index > len(self.main_data.df) - 1:
                logger.warning("Requested Bar-Time beyond the dataset.")
                return self.main_data.df.index[-1]
            elif index < -(len(self.main_data.df) - 1):
                logger.warning("Requested Bar-Time prior to start of the dataset.")
                return self.main_data.df.index[0]
            else:
                return self.main_data.df.index[index]

    # region ------------------------ Output Properties ------------------------

    @output_property
    def last_bar_index(self) -> int:
        "Last Bar Index of the dataset. Returns -1 if there is no valid data"
        return -1 if self._bar_state is None else self._bar_state.index

    @output_property
    def last_bar_time(self) -> pd.Timestamp:
        "Open Time of the Last Bar. Returns 1970-01-01 if there is no valid data"
        return pd.Timestamp(0) if self._bar_state is None else self._bar_state.time

    @output_property
    def bar_state(self) -> BarState:
        "BarState Object that represents the most recent data update. This is an Update-Only Output"
        if self._bar_state is not None:
            return self._bar_state
        return BarState()

    @output_property
    def dataframe(self) -> pd.DataFrame:
        "A reference to the full series dataframe"
        if self.main_data is not None:
            return self.main_data.df
        return pd.DataFrame({})

    @default_output_property
    def close(self) -> pd.Series:
        "A Series' Bar closing value"
        if self.main_data is not None and "close" in self.main_data.df.columns:
            return self.main_data.df["close"]
        return pd.Series({})

    @output_property
    def open(self) -> pd.Series:
        "A Series' Bar open value"
        if self.main_data is not None and "open" in self.main_data.df.columns:
            return self.main_data.df["open"]
        return pd.Series({})

    @output_property
    def high(self) -> pd.Series:
        "A Series' Bar high value"
        if self.main_data is not None and "high" in self.main_data.df.columns:
            return self.main_data.df["high"]
        return pd.Series({})

    @output_property
    def low(self) -> pd.Series:
        "A Series' Bar low value"
        if self.main_data is not None and "low" in self.main_data.df.columns:
            return self.main_data.df["low"]
        return pd.Series({})

    @output_property
    def volume(self) -> pd.Series:
        "A Series' Bar low value"
        if self.main_data is not None and "volume" in self.main_data.df.columns:
            return self.main_data.df["volume"]
        return pd.Series({})

    # endregion


# endregion
