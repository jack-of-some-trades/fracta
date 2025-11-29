"Pandas_Market_Calendars Adapter + Calendar Cache"

from __future__ import annotations
import logging
from functools import partial
from importlib import import_module
from types import ModuleType
from typing import TYPE_CHECKING, Dict, Optional

import pandas as pd

from ...types import TF

log = logging.getLogger("fracta_log")


# pylint: disable='invalid-name
if TYPE_CHECKING:
    import pandas_market_calendars as mcal
    from pandas_market_calendars import MarketCalendar

    schedule_error = mcal.calendar_utils.InsufficientScheduleWarning
    parse_schedule_error = mcal.calendar_utils.parse_insufficient_schedule_warning
else:
    mcal: Optional[ModuleType] = None
    schedule_error = None
    parse_schedule_error = None

EXCHANGE_NAMES = {}
ALT_EXCHANGE_NAMES = {}
EXT_MAP = {  # Trading Hours Integer Encoding
    "pre": 1,
    "rth_pre_break": 0,
    "rth": 0,
    "break": 3,
    "rth_post_break": 0,
    "post": 2,
    "closed": -1,
}


def enable_market_calendars():
    """
    Enables the Use of Pandas_Market_Calendars for more complex behavior

    It is suggested that this module is loaded after creating a window. This allows
    for a slightly better loading time of this library.
    """
    # pylint: disable-next=global-statement
    global mcal, EXCHANGE_NAMES, ALT_EXCHANGE_NAMES, schedule_error, parse_schedule_error
    mcal = import_module("pandas_market_calendars")
    EXCHANGE_NAMES = dict([(val.lower(), val) for val in mcal.get_calendar_names()])
    # Hard-Coded Alternate Names that might be passed as Exchange arguments
    ALT_EXCHANGE_NAMES = {
        "xnas": "NASDAQ",
        "arca": "NYSE",
        "forex": "24/5",
        "alpaca": "24/7",
        "polygon": "24/7",
        "polygon.io": "24/7",
        "coinbase": "24/7",
        "kraken": "24/7",
        "crypto": "24/7",
    }

    # Actually import the vars defined in typing check above.
    schedule_error = mcal.calendar_utils.InsufficientScheduleWarning
    parse_schedule_error = mcal.calendar_utils.parse_insufficient_schedule_warning
    # Raise Insufficient Schedule Warnings to Errors.
    mcal.calendar_utils.filter_date_range_warnings("error", schedule_error)


class Calendars:
    """
    Class to abstract and contain the functionality of pandas_market_calendars.

    This allows for Pandas_Market_Calendars to be conditionally loaded, defaulting to a calendar
    naive, 24/7 schedule, which is more performant for simple operations.

    Additionally, Instantiating only a single instance reduces unnecessary redundancy by making
    market schedules shared across all dataframes that utilize them. Considering that generating
    schedules is easily the slowest part of analyzing a Market's Open/Close Session this equates
    to a significant performance improvement.
    """

    def __init__(self):
        self.mkt_cache: Dict[str, "MarketCalendar"] = {}
        self.schedule_cache: Dict[str, pd.DataFrame] = {}
        # TODO: Implement a last used time to clean out memory for stale schedules?
        # self.mkt_cache_last_use_time = {}

    def _date_range_ltf(
        self,
        calendar: str,
        freq: pd.Timedelta,
        start: pd.Timestamp,
        end: Optional[pd.Timestamp],
        periods: Optional[int],
        include_ETH: bool | None = False,
    ) -> pd.DatetimeIndex:
        "private function to call mcal.date_range catching and handling any insufficient schedule errors."
        for _ in range(3):
            try:  # Exceedingly Rare, but this could be thrown twice in a row
                schedule = self.schedule_cache[calendar]
                return mcal.date_range(
                    schedule,
                    freq,
                    "left",
                    False,
                    {"RTH", "ETH"} if include_ETH else {"RTH"},
                    start=start,
                    end=end,
                    periods=periods,
                )
            except schedule_error as e:
                # Schedule isn't long enough to create the needed range. Expand it and retry.
                beginning, sched_strt, sched_end = parse_schedule_error(e)
                if not beginning:
                    sched_end += pd.Timedelta("16W")
                extra_days = self.mkt_cache[calendar].schedule(sched_strt, sched_end)
                if beginning:
                    self.schedule_cache[calendar] = pd.concat([extra_days, schedule])
                else:
                    self.schedule_cache[calendar] = pd.concat([schedule, extra_days])

        raise ValueError(
            "Calendar.date_range couldn't form a proper schedule. "
            f"{start = }, {end = }, {periods = }, schedule = {self.schedule_cache[calendar]}"
        )

    def request_calendar(self, exchange: Optional[str], start: pd.Timestamp, end: pd.Timestamp) -> str:
        "Request a Calendar & Schedule be Cached. Returns a token to access the cached calendar"
        if mcal is None or exchange is None:
            return "24/7"
        exchange = exchange.lower()
        if exchange in ALT_EXCHANGE_NAMES:
            cal = mcal.get_calendar(ALT_EXCHANGE_NAMES[exchange])
        elif exchange in EXCHANGE_NAMES:
            cal = mcal.get_calendar(EXCHANGE_NAMES[exchange])
        else:
            cal = None
            log.warning(
                "Exchange '%s' doesn't match any known exchanges. Using 24/7 Calendar.",
                exchange,
            )

        if cal is None or cal.name == "24/7":
            return "24/7"

        start = start - pd.Timedelta("1W")
        end = end + pd.Timedelta("1W")

        if cal.name not in self.mkt_cache:  # New Calendar Requested
            # Bind the Market_times & special_times arguments to the schedule function
            cal.schedule = partial(cal.schedule, market_times="all", force_special_times=False)
            self.mkt_cache[cal.name] = cal
            # Generate a Schedule with buffer dates on either side.
            self.schedule_cache[cal.name] = cal.schedule(start, end)
            return cal.name

        # Cached Calendar Requested
        extra_dates = None
        sched = self.schedule_cache[cal.name]
        if sched.index[0] > start.tz_localize(None):
            # Extend Start of Schedule with an additional buffer
            extra_dates = cal.schedule(
                    start, sched.index[0] - pd.Timedelta("1D"), market_times="all", force_special_times=False
                )
            sched = pd.concat([extra_dates, sched])
        if sched.index[-1] < end.normalize().tz_localize(None):
            # Extend End of Schedule with an additional buffer
            extra_dates = cal.schedule(
                sched.index[-1] + pd.Timedelta("1D"), end, market_times="all", force_special_times=False
            )
            sched = pd.concat([sched, extra_dates])

        if extra_dates is not None:  # Update the Cached schedule.
            self.schedule_cache[cal.name] = sched

        return cal.name

    def date_range(
        self,
        calendar: str,
        freq: TF,
        start: pd.Timestamp,
        end: Optional[pd.Timestamp] = None,
        periods: Optional[int] = None,
        include_ETH: bool | None = False,
    ) -> pd.DatetimeIndex:
        "Return a DateTimeIndex at the desired frequency only including valid market times."
        if calendar == "24/7":
            tf_str = freq.toStr
            # Need to define 'Start of period' for Month, Quarter, Year
            tf_str = tf_str + "S" if tf_str[-1] in {"M", "Q", "Y"} else tf_str
            return pd.date_range(start, end, freq=tf_str, periods=periods)
        if calendar not in self.mkt_cache:
            raise ValueError(f"{calendar = } is not loaded into the calendar cache.")

        if freq.is_ltf():
            return self._date_range_ltf(calendar, freq.to_timedelta(), start, end, periods, include_ETH)

        # For Time periods greater than 1D use HTF Date_Range.
        mkt_calendar = self.mkt_cache[calendar]
        days = mkt_calendar.date_range_htf(freq.toStr, start, end, periods, closed="left")
        time = "pre" if include_ETH and "pre" in mkt_calendar.market_times else "market_open"
        return pd.DatetimeIndex(
            mkt_calendar.schedule_from_days(days, market_times=[time])[time],
            dtype="datetime64[ns, UTC]",
        )

    def next_timestamp(
        self,
        calendar: str,
        current_time: pd.Timestamp,
        freq: TF,
        include_ETH: bool | None = False,
    ) -> pd.Timestamp:
        "Returns the next bar's opening time from a given timestamp. Not always efficient, so store this result"
        if freq.period == "W":
            next_time = pd.date_range(current_time, freq=freq.toStr, periods=2)[-1]
        elif freq.period in {"M", "Q", "Y"}:
            next_time = pd.date_range(current_time, freq=freq.toStr + "S", periods=2)[-1]
        else:
            next_time = current_time + freq.as_timedelta()

        if calendar == "24/7":
            return next_time

        # Calculate Next date from LTF Date_Range.
        if freq.as_timedelta() < pd.Timedelta("1D"):
            try:
                if self.mkt_cache[calendar].open_at_time(
                    self.schedule_cache[calendar], next_time, False, not include_ETH
                ):
                    return next_time
            except ValueError:
                # Schedule Doesn't Cover the Time Needed call Date_Range to generate more schedule.
                pass

            dt = self._date_range_ltf(calendar, freq.as_timedelta(), current_time, None, 2, include_ETH)
            return dt[-1]

        # Calculate Next date from HTF Date_Range.
        mkt_cal = self.mkt_cache[calendar]
        days = mkt_cal.date_range_htf(freq.toStr, start=current_time, periods=2)
        time = "pre" if include_ETH and "pre" in mkt_cal.market_times else "market_open"
        dt = mkt_cal.schedule_from_days(days, market_times=[time])[time]
        return mkt_cal.schedule_from_days(days, market_times=[time])[time].iloc[-1]

    def mark_session(self, calendar: str, time_index: pd.DatetimeIndex) -> pd.Series | None:
        "Return a Series that denotes the appropriate Trading Hours Session for the given Calendar"
        if mcal is None or calendar == "24/7":
            return None

        _ser = mcal.mark_session(self.schedule_cache[calendar], time_index, label_map=EXT_MAP, closed="left")
        _ser.name = "rth"

        return _ser

    def session_at_time(self, calendar: str, dt: pd.Timestamp) -> int | None:
        "Check what session the given timestamp is part of. Inherently closed ='left'"
        if mcal is None or calendar == "24/7":
            return None

        # Unbelievable, but this truly is the easiest and most efficient way to determine the active session.
        time_index = pd.DatetimeIndex([dt])
        return int(
            mcal.mark_session(
                self.schedule_cache[calendar],
                time_index,
                label_map=EXT_MAP,
                closed="left",
            ).iloc[0]
        )


# Initialize the shared Calendars sudo-singleton instance
CALENDARS = Calendars()
