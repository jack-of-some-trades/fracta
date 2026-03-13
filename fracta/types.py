"""Basic Types and TypeAliases"""

import logging
from math import floor
from inspect import signature
from datetime import datetime
from dataclasses import dataclass, field
from typing import Any, TypeAlias, Literal, Optional, Self, get_args

from pandas import Timestamp, Timedelta

# pylint: disable=invalid-name

logger = logging.getLogger("fracta_log")

# region ---- ---- ---- ---- ---- ---- Ticker Dataclass ---- ---- ---- ---- ---- ---- #

j_func: TypeAlias = str


@dataclass(slots=True)
class Ticker:
    "Dataclass interface used to send Symbol Search information to the Symbol Search Menu"

    symbol: str
    name: Optional[str] = None
    source: Optional[str] = None
    exchange: Optional[str] = None
    asset_class: Optional[str] = None
    attrs: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, obj: Optional[dict] = None, **kwargs) -> Self:
        """
        Creates a Symbol populating what it can from the given dictionary or key-word args.
        If duplicate keys are passed in the dictionary and key-word args, the dictionary is favored.
        This allows Default arguments to be passed as kwargs to supplement missing dictionary keys.
        Any additional keys will be placed in the attrs dictionary.
        """
        args = {**obj} if obj is not None else {}
        args = kwargs | args  # Merge Preferring keys from the 'obj' dictionary

        if "ticker" in args and "symbol" not in args:
            args["symbol"] = args.pop("ticker")

        if "symbol" not in args:
            logger.error(
                'Symbol.from_dict() must be given a dictionary with a "ticker" or "symbol" key. Given: %s',
                obj,
            )
            return cls("FRACTA")

        params = signature(cls).parameters

        attrs = {k: v for k, v in args.items() if k not in params}  # all extra keys
        # Merge in an attrs dict if it was passed in the 'obj' dict
        if "attrs" in args:
            attrs.update(**args["attrs"])
            args.pop("attrs", None)

        return cls(**{k: v for k, v in args.items() if k in params}, attrs=attrs)

    @property
    def valid_attrs(self) -> set[str]:
        "The set of all attrs keys that have a value that is not None."
        return set((k for k, v in self.attrs.items() if v is not None))

    def get(self, attr: str, default: Any = None) -> Any | None:
        "Safely get an attribute from the symbol return None if not found"
        if attr in {"symbol", "name", "source", "asset_class", "exchange", "attrs"}:
            return getattr(self, attr)
        else:
            return self.attrs.get(attr, default)

    def __getitem__(self, attr: str) -> Any | None:
        "Accessor Forward to safely check the extra attributes of the symbol"
        return self.attrs.get(attr, None)

    def __eq__(self, other: Self) -> bool:
        # Not checking name field since a timeseries set can be unique defined by below criteria
        return (
            self.symbol.lower() == other.symbol.lower()
            and _str_compare(self.source, other.source)
            and _str_compare(self.exchange, other.exchange)
            and _str_compare(self.asset_class, other.asset_class)
        )


def _str_compare(a: Optional[str], b: Optional[str]) -> bool:
    "Compare two strings that are potentially undefined"
    if a is not None and b is not None:
        return a.lower() == b.lower()
    return a == b


# endregion

# region ---- ---- ---- ---- ---- ---- Color Dataclass ---- ---- ---- ---- ---- ---- #


def NumtoHex(num: int):
    "Format a [0,255] number into Hex"
    return hex(num).lstrip("0x").zfill(2)


# Note, this object cannot be a dataclass otherwise json.dumps()
# will dump this out as a dict. For functionality we need to call repr() on dumps()
class Color:
    """
    RBGa Color Class. To instatiate use Color.from_rgb() or Color.from_hex()
    Original Object: https://www.w3schools.com/cssref/func_rgba.php
    """

    def __init__(self, r: int, g: int, b: int, a: float):
        self._r = r
        self._b = b
        self._g = g
        self._a = a

    def __eq__(self, other: Self):
        return (self._r == other.r) and (self._g == other.g) and (self._b == other.b) and (self._a == other.a)

    def __neq__(self, other: Self):
        return (self._r != other.r) or (self._g != other.g) or (self._b != other.b) or (self._a != other.a)

    @classmethod
    def from_color(
        cls,
        ref: Self,
        r: int | None = None,
        g: int | None = None,
        b: int | None = None,
        a: float | None = None,
    ):
        "Instantiate a new Color Instance, from a Given Color Instance, updating the given RGB Values"
        new_inst = cls(0, 0, 0, 0)
        # Pass variables after construction to Value Check them w/ setter funcs
        new_inst.r = r if r is not None else ref.r
        new_inst.g = g if g is not None else ref.g
        new_inst.b = b if b is not None else ref.b
        new_inst.a = a if a is not None else ref.a
        return new_inst

    @classmethod
    def from_rgb(cls, r: int, g: int, b: int, a: float = 1):
        "Instantiate a new Color Instance from RGB Values"
        new_inst = cls(0, 0, 0, 0)
        # Pass variables after construction to Value Check them w/ setter funcs
        new_inst.r = r
        new_inst.g = g
        new_inst.b = b
        new_inst.a = a
        return new_inst

    @classmethod
    def from_hex(cls, hex_value: str):
        "Instantiate a new Color Instance from a hex string of 3, 4, 6, or 8 chars."
        hex_value = hex_value.lstrip("#")
        if len(hex_value) == 6 or len(hex_value) == 8:
            # Hex String of 6 or 8 Chars
            r, g, b = [int(hex_value[i : i + 2], 16) for i in (0, 2, 4)]
            alpha = 1 if (len(hex_value) != 8) else int(hex_value[6:8], 16) / 255

        elif len(hex_value) == 3 or len(hex_value) == 4:
            # Hex String of 3 or 4 Chars
            r, g, b = [((int(char, 16) << 4) + (int(char, 16))) for char in hex_value[0:3]]
            alpha = 1 if (len(hex_value) != 4) else ((int(hex_value[3], 16) << 4) + int(hex_value[3], 16)) / 255
        else:
            raise ValueError(f"Hex Color of length {len(hex_value)} is not valid.")
        return cls(r, g, b, alpha)

    @classmethod
    def from_gradient(cls, value: float, from_val: float, to_val: float, from_col: Self, to_col: Self) -> Self:
        "Returns a color based on the relative position of value in the [bot, top] Range."
        if value <= from_val:
            return from_col
        if value >= to_val:
            return to_col
        ratio = (value - from_val) / (to_val - from_val)

        r = floor((to_col._r - from_col._r) * ratio + from_col._r)
        g = floor((to_col._g - from_col._g) * ratio + from_col._g)
        b = floor((to_col._b - from_col._b) * ratio + from_col._b)
        a = floor((to_col._a - from_col._a) * ratio + from_col._a)

        return cls(r, g, b, a)

    # region // -------------- Color Getters & Setters -------------- //
    @property
    def r(self):
        "Red: int [0, 255]"
        return self._r

    @r.setter
    def r(self, r: int):
        if r > 255:
            raise ValueError(f"Arg: {r = } is not valid. Max Value is 255.")
        if r < 0:
            raise ValueError(f"Arg: {r = } is not valid. Min Value is 0.")
        self._r = r

    @property
    def g(self):
        "Green: int [0, 255]"
        return self._g

    @g.setter
    def g(self, g: int):
        if g > 255:
            raise ValueError(f"Arg: {g = } is not valid. Max Value is 255.")
        if g < 0:
            raise ValueError(f"Arg: {g = } is not valid. Min Value is 0.")
        self._g = g

    @property
    def b(self):
        "Blue: int [0, 255]"
        return self._b

    @b.setter
    def b(self, b: int):
        if b > 255:
            raise ValueError(f"Arg: {b = } is not valid. Max Value is 255.")
        if b < 0:
            raise ValueError(f"Arg: {b = } is not valid. Min Value is 0.")
        self._b = b

    @property
    def a(self):
        "alpha: float [0, 1]"
        return self._a

    @a.setter
    def a(self, a: float):
        if a > 1:
            raise ValueError(f"Arg: {a = } is not valid. Max Value is 1.")
        if a < 0:
            raise ValueError(f"Arg: {a = } is not valid. Min Value is 0.")
        self._a = a

    # endregion

    def __repr__(self):
        "Javascript RGBA Representation of Class Params."
        return f"rgba({self._r},{self._g},{self._b},{self._a})"

    def to_hex(self):
        "Javascript RGBA Representation of Class Params."
        return f"#{NumtoHex(self._r)}{NumtoHex(self._g)}{NumtoHex(self._b)}{NumtoHex(round(self._a*255))}"


# String Should be a #(Hex) Color.
JS_Color: TypeAlias = str | Color

# endregion

# region ---- ---- ---- ---- ---- ---- Timeframe Dataclass ---- ---- ---- ---- ---- ---- #

TF_PERIOD_CODES: TypeAlias = Literal["s", "m", "h", "D", "W", "M", "Y", "E"]
TF_CODE_SET = set(get_args(TF_PERIOD_CODES))

UTCTimestamp: TypeAlias = int
Time: TypeAlias = UTCTimestamp | str | Timestamp | datetime
# Time: TypeAlias = Union[UTCTimestamp, BusinessDay, str]
# BusinessDay is an object in the lightweight charts library. It is not included since
# it only supports timeframes of 'Day' or longer. This is also true for Lightweight-chart's string
# as well, but this python library can convert strings to a Standard Pandas Timestamp


@dataclass(slots=True)
class TF:
    """
    Dataclass Representation of a Timeframe, Constructed directly from an integer
    and a Period Code or from a string using TF.fromStr().

    A String time code is the simple concatenation of the multiplier and the period code.
    The Period Code is required, but the multiplier is not. If no multiplier is given then
    it is assumed to be 1.

    The Multiplier should not be so large that it encroaches into an adjacent Period Code.
    e.g. '0.25m' and '24h' are invalid, use '15s' or '1D' instead

    Period Codes:
        "s" = seconds,
        "m" = minutes,
        "h" = hours,
        "D" = Days,
        "W" = Weeks,
        "M" = Months,
        "Y" = Years
    """

    _mult: int
    _period: TF_PERIOD_CODES

    def __init__(self, mult: int, period: TF_PERIOD_CODES):
        self._validate(mult, period)
        self._period = period
        self._mult = mult

    def __str__(self) -> str:
        return self.toStr

    def is_ltf(self) -> bool:
        "Check if the given TF is a Long Term Frequency"
        return self._period in {"s", "m", "h"}

    def to_timedelta(self) -> Timedelta:
        "Create a Pandas Timedelta Object from the TF Object"
        if self.is_ltf():
            return Timedelta(f"{self._mult}{self._period}")
        elif self._period == "D":
            return Timedelta(f"{self._mult}D")
        elif self._period == "W":
            return Timedelta(f"{self._mult * 7}D")
        elif self._period == "M":
            # 1 Unix Month = 2629743 Seconds
            return Timedelta(days=self._mult * (2629743 / 86400))
        elif self._period == "Y":
            # 1 Unix Year = 31556926 Seconds
            return Timedelta(days=self._mult * (31556926 / 86400))
        else:
            raise ValueError(f"Unsupported period code: {self._period}")

    @classmethod
    def fromStr(cls, tf_str: str) -> Self:
        "Create a TF Object from a formatted string"
        period = tf_str[-1]
        mult = tf_str[0:-1]
        mult = int(mult) if mult != "" else 1
        if period in TF_CODE_SET:
            return TF(mult, period)  # type: ignore

        raise TypeError(f"'{period}' not a valid Timeframe Period Code.")

    @classmethod
    def from_timedelta(cls, interval: Timedelta) -> Self:
        "Create a TF Object from a Pandas Timedelta Object"
        if interval < Timedelta("1s"):
            raise ValueError(
                "Series Data cannot be Tick Data, it must be aggrigated to at least 1 Second intervals first."
            )

        errmsg = f"Interval [{interval}] invalid. Series Data must be a simple interval. (An integer multiple of a single period [D|h|m|s])"

        comp = interval.components
        if comp.days > 0:
            if comp.hours + comp.minutes + comp.seconds > 0:
                raise ValueError(errmsg)
            if comp.days < 7:
                return cls(comp.days, "D")
            if comp.days < 28:
                logger.info("Attempting to Classify Weekly Interval, %s", interval)
                return cls(floor(comp.days / 7), "W")
            if comp.days < 365:
                logger.info("Attempting to Classify Monthly Interval, %s", interval)
                # Denominator is 1 Unix Month / 1 Unix Day
                return cls(floor(comp.days / (2629743 / 86400)), "M")
            else:
                logger.info("Attempting to Classify Yearly Interval, %s", interval)
                # Denominator is 1 Unix Year / 1 Unix Day
                return cls(floor(comp.days / (31556926 / 86400)), "Y")
        elif comp.hours > 0:
            if comp.minutes + comp.seconds > 0:
                raise ValueError(errmsg)
            return cls(comp.hours, "h")
        elif comp.minutes > 0:
            if comp.seconds > 0:
                raise ValueError(errmsg)
            return cls(comp.minutes, "m")
        elif comp.seconds > 0:
            return cls(comp.seconds, "s")

        # This should never be reached.
        raise ValueError(f"Failed to Classify Interval {interval}")

    # region ---- Comparators ----

    def __eq__(self, other: Self):
        return self.unix_len == other.unix_len

    def __neq__(self, other: Self):
        return self.unix_len != other.unix_len

    def __gt__(self, other: Self):
        return self.unix_len >= other.unix_len

    def __ge__(self, other: Self):
        return self.unix_len > other.unix_len

    def __lt__(self, other: Self):
        return self.unix_len < other.unix_len

    def __le__(self, other: Self):
        return self.unix_len <= other.unix_len

    # endregion

    # region ---- Timeframe Getters and Setters ----

    @property
    def mult(self) -> int:
        "Timeframe Multiplier"
        return self._mult

    @mult.setter
    def amount(self, value: int):
        self._validate(value, self._period)
        self._mult = value

    @property
    def period(self) -> TF_PERIOD_CODES:
        "Timeframe Period"
        return self._period

    @period.setter
    def period(self, value: TF_PERIOD_CODES):
        self._validate(self._mult, value)
        self._period = value

    @property
    def toStr(self) -> str:
        "String representation fmt:{multiplier}{period}"
        return f"{self._mult}{self._period}"

    # endregion

    @staticmethod
    def _validate(amount: int, unit: TF_PERIOD_CODES):
        if amount == 0:
            amount = 1
        elif amount < 0:
            raise ValueError(f"Timeframe Period Multiplier,{amount}, must be a positive value.")
        if amount != round(amount):
            raise ValueError(f"Timeframe Period Multiplier,{amount}, must be an integer value.")

        match unit:
            case "s" | "m":
                if amount > 59:
                    raise ValueError("Seconds & Minutes multiplier must be in [1, 59].")
            case "h":
                if amount > 23:
                    raise ValueError("Hour multiplier must be in [1, 23].")
            case "D":
                if amount > 6:
                    raise ValueError("Day multiplier must be in [1, 6].")
            case "W":
                if amount > 4:
                    raise ValueError("Week multiplier must be in [1, 4].")
            case "M":
                if amount not in (1, 2, 3, 6):
                    raise ValueError("Month units must be (1, 2, 3, 6)")
            case "Y" | "E":
                return
            case _:
                raise ValueError(f"'{unit}' Not a valid timeframe period.")

    @property
    def unix_len(self) -> int:
        """
        The length, in seconds, that the timeframe represents.

        1 Month = 30.44 Days, 1 Year = 365.24 Days (Unix Standard Conversions)
        """
        match self._period:
            case "s":
                return self._mult
            case "m":
                return self._mult * 60
            case "h":
                return self._mult * 3600
            case "D":
                return self._mult * 86400
            case "W":
                return self._mult * 604800
            case "M":
                return self._mult * 2629743
            case "Y":
                return self._mult * 31556926
            case _:
                raise ValueError("Attempting to get length of an invalid Timeframe.")

    def as_timedelta(self) -> Timedelta:
        """
        The Timeframe returned as a Pandas Timedelta Object.

        Month & Year Timeframes follow the unix standard:
        1 Month = 30.44 Days, 1 Year = 365.24 Days
        """
        return Timedelta(self.unix_len * 1_000_000_000)


# endregion
