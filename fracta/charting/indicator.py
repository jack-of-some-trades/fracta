"""Classes and functions that handle implementation of chart indicators"""

from __future__ import annotations
from dataclasses import field
from importlib import import_module
from logging import getLogger
from abc import abstractmethod
from inspect import signature, _empty, currentframe
from multiprocessing import Queue
from typing import (
    ClassVar,
    Optional,
    Any,
    Callable,
    Self,
    TypeAlias,
)
import weakref

import pandas as pd

from .indicator_meta import (
    IndicatorMeta,
    OptionsMeta,
    IndicatorPackage,
)

from .. import py_window as win
from . import primitive as pr
from . import series_common as sc
from ..util import ID_Dict, is_dunder
from ..js_cmd import JS_CMD
from ..types import Color

log = getLogger("fracta_log")

SeriesData: TypeAlias = Callable[[], pd.Series]
DataframeData: TypeAlias = Callable[[], pd.DataFrame]


# region --------------------------- Attribute Application Functions --------------------------- #


def output_property[T: Callable](func: T) -> T:
    "Property Decorator used to expose Indicator Parameters to other Indicators"
    func.__expose_param__ = True
    return func


def default_output_property[T: Callable](func: T) -> T:
    "Property Decorator used to expose Indicator Parameters to other Indicators"
    func.__expose_param__ = True
    func.__default_param__ = True
    return func


# pylint: disable=redefined-builtin
def param[T](
    default: T,
    title: Optional[str] = None,
    group: Optional[str] = None,
    inline: Optional[str] = None,
    tooltip: str = "",
    *,
    options: Optional[list[T]] = None,
    min: Optional[float] = None,
    max: Optional[float] = None,
    step: Optional[float] = None,
    slider: Optional[bool] = None,
    autosend: bool = True,
):
    """
    Define additional configuration options for an indicator input variable.

    Ints and floats can provide min_val, max_val, and step_val arguments.

    If given an options list, a drop down menu selector will become available.
    An options list will override any min, max, and step params that are given.
    """

    try:
        # Know when to break the rules >:D
        namespace = currentframe().f_back.f_locals  # type: ignore
        struct = namespace.get("__arg_params__")
        if struct is None:
            struct = namespace["__arg_params__"] = {}

        arg_name = "@arg" + str(len([key for key in namespace.keys() if not is_dunder(key)]))

        struct[arg_name] = {
            "title": title,
            "group": group,
            "inline": inline,
            "tooltip": tooltip if tooltip != "" else None,
            "options": options,
            "min": min,
            "max": max,
            "step": step,
            "slider": slider,
            "autosend": autosend,
        }

    except AttributeError as e:
        raise AttributeError(
            """
            Options input function invoked in improper context.
            e.g. A jupyter notebook where namespace frames are invalid.
            """
        ) from e

    # Really?? You throw an exception when not using default_factory. That's excessive.
    # pylint: disable=invalid-field-call
    return field(default_factory=lambda: default)
    # pylint: enable=invalid-field-call redefined-builtin


# endregion

# pylint: disable=protected-access
# region --------------------------- Indicator Options Classes --------------------------- #


class IndicatorOptions(metaclass=OptionsMeta):
    "Inheritable Indicator Options Class"

    # Dunders populated by the OptionsMeta Class
    __arg_types__: ClassVar[dict] = {}
    __src_types__: ClassVar[dict] = {}
    __menu_struct__: ClassVar[dict] = {}

    def to_dict(self) -> dict:
        "Parses the Dataclass Object into a formatted, JSON dumpable, dict"
        _opts = {}
        for k, arg_type in self.__arg_types__.items():
            v = getattr(self, k, None)
            if arg_type == "source":
                # Replace all source args with Tuple[str] representations of the functions
                # boundCls.Func_name() -> out_args === "[boundCls.id]:[Func_name]"
                _opts[k] = getattr(getattr(v, "__self__", None), "_js_id", "None")
                _opts[k] += ":" + getattr(v, "__name__", "None")
            elif arg_type == "enum":
                # Normally we dump the value, in this case we dump the name since
                # it's only displayed in JS, not used.
                _opts[k] = v.name if v is not None else None
            else:
                # Remaining Objs are picklable and can be json dumped
                _opts[k] = v
        return _opts

    @classmethod
    def from_dict(cls, args: dict, parent_frame: win.ChartingFrame) -> Self:
        """
        Creates and returns an instance of the Dataclass from a formatted dict.
        ** The values of the given arguments dict are mutated by this function **
        """
        for k, v in args.items():
            arg_type = cls.__arg_types__[k]

            if arg_type == "source":
                ind_id, func_name = v.split(":")
                try:
                    ind = parent_frame.indicators[ind_id]
                    args[k] = getattr(ind, func_name)
                except (IndexError, AttributeError):
                    args[k] = lambda: None
                    log.critical("Source link %s is invalid.", v)
                    # Critical Error since this will most likely cause an
                    # indicator's Set/Update_Data to throw an exception

            elif arg_type == "timestamp":
                args[k] = pd.Timestamp(v)

            elif arg_type == "enum":
                args[k] = cls.__src_types__[k]._member_map_[v]

            elif arg_type == "color":
                args[k] = Color.from_hex(v)

        return cls(**args)


# endregion

# region --------------------------- Indicator & Watcher Classes --------------------------- #


class Watcher:
    """
    An Indicator instance object that links one indicator to another, monitoring for data updates.
    Instances of this class are handed to another indicator it wishes to observe in link_args().

    Watchers hold permanent references to it's parent Indicators set, clear, and update methods.
    They also hold mutable References to other indicator's output_property functions to fetch data.
    """

    def __init__(self, parent: "Indicator"):
        self._parent = weakref.ref(parent)

        # set & updated ensure all indicators only set/update once they are ready to. Set, being
        # more of a latch, is likely bug free. However, doing this for updated **may** lead to an
        # edge case bug where an indicator may never (or only intermittently) update if it depends
        # on two or more Series Indicators that receive data updates at different rates.
        self.set = False
        self.updated = False

        self.observables: dict[str, Callable] = {}
        self.set_args: dict[str, Callable] = {}
        self.set_notifiers: list[Indicator] = []
        self.update_args: dict[str, Callable] = {}
        self.update_notifiers: list[Indicator] = []

    def reset_updated_state(self):
        "Reset the Updated state and tell all observers to reset as well, an update is coming"
        self.updated = False
        if (parent := self._parent()) is not None:
            for watcher in parent._observers:
                watcher.reset_updated_state()

    def notify_set(self):
        "Notify the Watcher that an update occured in the given Indicator"
        if self.set or (parent := self._parent()) is None:
            return

        if all([ind._watcher.set for ind in self.set_notifiers]):
            # All indicator srcs Ready, Preform historical set_data calc.
            # Will Fire on Notifier = None, intentional so Watcher can self-fire on init
            parent.set_data(**dict([(name, func()) for name, func in self.set_args.items()]))
            self.set = True
            parent._notify_observers_set()

    def notify_update(self):
        "Notify the Watcher that an update occured in the given Indicator"
        if self.updated or (parent := self._parent()) is None:
            return

        if all([ind._watcher.updated for ind in self.update_notifiers]):
            # Ready to Update, Fire Update then set updated Readiness State
            parent.update_data(**dict([(name, func()) for name, func in self.update_args.items()]))
            self.updated = True
            parent._notify_observers_update()

    def notify_clear(self):
        "Notify the Watcher that the source it calculated from is no longer valid and should clear"
        if (parent := self._parent()) is None:
            return

        self.set = False
        self.updated = False
        parent.clear_data()
        parent._notify_observers_clear()

    # pylint: disable=unused-variable
    def link_args(self, args: dict[str, Callable[[], Any]], parent: "Indicator"):
        "Link this Watcher to all of the indicators it needs to observe"
        if len(self.observables) > 0:
            self._unlink_all_args()  # Clear all present args before setting

        parent_cls = parent.__class__
        main_series = parent.parent_frame.timeseries

        # Auto-Link default args if the Indicator requests it.
        if "bar_state" in parent_cls.__input_args__ and "bar_state" not in args:
            args["bar_state"] = main_series.bar_state
        if "time" in parent_cls.__input_args__ and "time" not in args:
            args["time"] = main_series.last_bar_time
        if "index" in parent_cls.__input_args__ and "index" not in args:
            args["index"] = main_series.last_bar_index

        # Check all required argument links are present
        if not set(parent_cls.__input_args__.keys()).issubset(args.keys()):
            missing_args = set(parent_cls.__input_args__.keys()).difference(args.keys())
            raise ValueError(f"{parent.cls_name} Missing Arg Links for: {missing_args}")

        # Type check the inputs, Prepare Watcher, and look for circular dependencies
        for name, (arg_type, default_arg) in parent_cls.__input_args__.items():
            # Not likely to actually implement a default_arg but it's right there
            rtn_type = signature(args[name]).return_annotation
            rtn_type = object if rtn_type is _empty else rtn_type

            # --------- Type Check the Function Given ---------
            if not issubclass(arg_type, rtn_type):
                raise TypeError(f"{parent.cls_name} Given {rtn_type} for parameter {name}. Expected {arg_type}")

            # --------- Give this Watcher Object to the indicator it is going to observe ---------

            bound_cls_inst = args[name].__self__  # Get the Indicator Instance bound to the desired output

            if bound_cls_inst._watcher in parent._observers:
                # Check that there isn't a Circular Dependence between Indicators
                log.critical(  # ATM this only protects against direct circular dependencies
                    "Circular Indicator dependency between %s & %s",
                    bound_cls_inst.cls_name,
                    parent.cls_name,
                )
                # Provide a Fake Source that yields an empty instance of the type expected. While
                # this just delays a crash, this does allow the user to fix the issue before then.
                args[name] = arg_type  # === lambda: arg_type()
                args[name].__self__ = None

            elif self not in bound_cls_inst._observers:
                # If no circular dependace, place this watcher into that indicator's _observers list
                # signifying this watcher is observing that indicator instance for updates
                bound_cls_inst._observers.append(self)

            # --------- Create Dicts of {*arg_name*: function to call for *arg_name* data} ---------

            if name in parent_cls.__set_args__:
                self.set_args[name] = args[name]
                self.set_notifiers.append(bound_cls_inst)
            if name in parent_cls.__update_args__:
                self.update_args[name] = args[name]
                self.update_notifiers.append(bound_cls_inst)

            # self.observables === Union(self.set_args & self.update_args)
            self.observables[name] = args[name]

    # pylint: enable=unused-variable

    def _unlink_all_args(self):
        "Unsubscribe from all of the linked input args"
        # Clear this indicator and all dependant indicators
        self.notify_clear()

        # Remove self from all of the '_observers' lists that it's appended to
        bound_arg_funcs = self.observables.values()
        for bound_func_cls in set([func.__self__ for func in bound_arg_funcs]):
            if bound_func_cls is not None:
                bound_func_cls._observers.remove(self)

        # Clear Watcher after unbinding
        self.set_args = {}
        self.set_notifiers = []
        self.update_args = {}
        self.update_notifiers = []
        self.observables = {}


class Indicator(metaclass=IndicatorMeta):
    """
    Indicator Abstract Base Class. This class defines the code neccessary for subclasses to manage
    timeseries data calculations, updates, and creating series/primitives objects that are
    drawn on the screen.

    Subclasses need to define an __init__(), Set_Data(), and Update_Data() function to be complete.
    __init__ must link callables (That fetch a set of timeseries data) to the function arguments of
    Set_data and Update_data (See function Docstrings). Set_Data should define a historical data
    calculation based on a full dataset. Update_Data Should update the historical calculation
    given an update to the source dataset.

    Indicators apply themselves to the screen by appending themselves to their parent frame's
    indicators dictionary.
    """

    # An object self appending to a parent's instance dictionary may obfuscate the how that dict
    # is populated, but it is by far the simplest solution

    # The first alternative would be requesting a _js_id from the Frame, letting the user create the
    # object. The problem is that there is no indication that the user *must* get an ID from the
    # frame. They could have simply supplied their own string and run into bugs later.

    # The second alternative would be to have the user supply the Indicator subclass and all the
    # required arguments only for the Frame to then construct and return the indicator. This isn't
    # ideal since you lose all type checking during object creation, and the owner of the object
    # isn't the one actually creating the object.

    _fwd_queue: Queue
    # Optional Definition of an Options Dataclass; set by User
    __options__: Optional[type[IndicatorOptions]] = None
    # Dunder Cls Params specific to each Sub-Class; set by MetaClass
    __set_args__: dict[str, tuple[type, Any]]
    __input_args__: dict[str, tuple[type, Any]]
    __update_args__: dict[str, tuple[type, Any]]
    __default_output__: Optional[SeriesData]
    __exposed_outputs__: dict[str, str]

    # Dunder Cls Param referenced by all Sub-Classes of Indicator
    __loaded_indicators__: dict[str, "type[Indicator]"] = {}
    __registered_indicators__: dict[str, IndicatorPackage] = {}

    def __init__(self, parent: "win.ChartingFrame | Indicator", *, display_name: str = "", js_id: Optional[str] = None):
        if isinstance(parent, win.ChartingFrame):
            self.parent_frame = parent
        else:
            self.parent_frame = parent.parent_frame

        if js_id is None:
            self._js_id = self.parent_frame.indicators.generate_id(self)
        else:
            self._js_id = self.parent_frame.indicators.affix_id(js_id, self)

        # Must preform this check after id generation so parent.main_series is guaranteed valid.
        # (Specifically for when parent.main_series is trying to find a reference to itself)
        if isinstance(parent, win.Frame):
            self.parent_indicator = parent.timeseries
        else:
            self.parent_indicator = parent

        # Tuple of Ids to make addressing through Queue easier: order = (frame, indicator)
        self._ids = self.parent_frame.js_id, self._js_id

        if getattr(self, "_fwd_queue", None) is None:
            # The first indicator since being launched is being initilized. Set the Indicator Menu
            Indicator._fwd_queue = self.parent_frame._fwd_queue
            self.__populate_ind_pkgs__()

        # Bind the default output function's 'self' to this instance
        if self.__default_output__ is not None:
            self.default_output: Optional[Callable[[], pd.Series]] = self.__default_output__.__get__(
                self, self.__class__
            )
        else:
            self.default_output = None

        self._series = ID_Dict[sc.SeriesCommon]("s")
        self._primitives = ID_Dict[pr.PrimitiveBase]("p")

        # Setup Indicator Observer Structures
        self._watcher = Watcher(self)
        self._observers: list[Watcher] = []

        self.events = self.parent_frame._window.events
        self.cls_name = self.__class__.__name__
        self.display_name = display_name

        self._fwd_queue.put(
            (
                JS_CMD.CREATE_INDICATOR,
                *self._ids,
                self.__exposed_outputs__,
                self.cls_name,
                display_name,
            )
        )

    @property
    def js_id(self) -> str:
        """
        Immutable Copy of the Object's Javascript_ID. The Id is unique only to it's frame
        Use this Object's Hash ID if a truly unique ID is required.
        """
        return self._js_id

    @property
    def default_parent_src(self) -> Callable[[], pd.Series]:
        """
        The default series output of the parent indicator. If the parent does not have a default
        output then the 'close' of the current frame's main series is returned.
        """
        if self.parent_indicator.default_output is not None:
            return self.parent_indicator.default_output

        return self.parent_frame.timeseries.close

    def __del__(self):
        log.debug("Deleteing %s: %s", self.__class__.__name__, self._js_id)

    def __getitem__(self, index: int):
        "Syntactic sugar for accessing the time of a bar index"
        return self.bar_time(index)

    def _notify_observers_set(self):
        "Notify All observers to preform a bulk historical calculation"
        for watcher in self._observers:
            watcher.notify_set()

    def _notify_observers_update(self):
        "Notify All observers there is an update to be made"
        for watcher in self._observers:
            watcher.notify_update()

    def _notify_observers_clear(self):
        "Notify All observers they should clear their state"
        for watcher in self._observers:
            watcher.notify_clear()

    def recalculate(self):
        "Manually force a full recalculation of this indicator and all dependent indicators"
        self._watcher.notify_set()

    def __update_options__(self, args: dict) -> Optional[IndicatorOptions]:
        "Parse a dictionary into an instance of self.__options__ and call self.update_options"
        if self.__options__ is None:
            log.error("Cannot load obj, %s needs an options Class", self.cls_name)
            return

        recalculate = self.update_options(self.__options__.from_dict(args, self.parent_frame))

        if recalculate:
            self.recalculate()

    def delete(self):
        "Remove the indicator and all of it's instance objects"
        self._watcher._unlink_all_args()

        for series in self._series.copy().values():
            series.delete()
        for primative in self._primitives.copy().values():
            primative.delete()

        self.clear_data()  # Clear data after deleting sub-objects to limit redundant actions
        self.parent_frame.indicators.pop(self._js_id)
        self._fwd_queue.put((JS_CMD.DELETE_INDICATOR, *self._ids))

    # region ------------------- Abstract Methods -------------------

    @abstractmethod
    def set_data(self, *_, **__):
        """
        Set the base data of the indicator. This is called when the base dataset of the indicator
        becomes available or changes due to a timeframe / symbol change. This is analogous to
        historical bar calculation in Pinescript, however should be done in vectorized calculations
        on Pandas' DataFrames / Series Objects

        The arguments of this function are completely arbitrary. They can be any data type so long
        as they have a unique keyword. If this keyword is used by the update_data() method then they
        must share the same datatype. set_data() and update_data() can have different signatures and
        dependencies though!

        During initialization / A change in options this indicator may call the link_args() method.
        This method takes a dict[str:Callable]. The string is a keyword that matches a keyword arg
        of the set_data() or update_data() methods. The Callable must be an output property of
        another indicator. Once all source Indicators have be set/updated this indicator will
        have it's respective set_data() / update_data() method automatically called.

        This method does not have to be dependent on other indicators though. The Series(Indicator)
        class is a great example. It only recieves data from external sources. Those sources simply
        invoke the set_data() / update_data() methods manually.
        """

    @abstractmethod
    def update_data(self, *_, **__):
        """
        Update the output of the indicator given an incremental update. This method will typically
        require bar_state:BarState as an argument.

        bar_state is a default argument that will automatically link when present in the signature
        of a set_data()/update_data() method. The automatic link will connect to the base source of
        series data on the Frame this indicator is attached too. This connection can be overwritten
        by manually passing the desired connection to link_args().
        """

    def clear_data(self):
        """
        Clear Data from the indicator, resetting it the post __init__ state. This is also called
        just prior to indicator deletion, so can reliably clean up the state of linked objects.

        If this function is extended by a subclass, that indicator should call super().clear_data()
        since this function clears all series and primitive data.
        """
        for series in self._series.values():
            series.clear_data()
        for primitive in self._primitives.values():
            primitive.reset()

    def update_options(self, _: IndicatorOptions) -> bool:
        """
        Optional Abstract Method. If the user adjusts this indicator's Options on the screen,
        This method is called with a new instance of the __options__ dataclass.

        The user defines how the options instance is applied to the indicator and then returns a
        boolean. If true is returned, the indictor will force a full recalculation of itself and
        all dependent indicators.
        """
        return False

    # endregion

    def link_args(self, args: dict[str, Callable[[], Any]]):
        """
        Subscribe this indicator's inputs to the provided indicator output arguments.

        :param: args: a dictionary providing links for all Set and Update args.
        """
        self._watcher.link_args(args, self)

    @classmethod
    def __populate_ind_pkgs__(cls):
        "Transfer all indicator package metadata to the window."
        cls._fwd_queue.put((JS_CMD.POPULATE_IND_PKGS, cls.__registered_indicators__))

    @classmethod
    def __update_ind_pkg__(cls, pkg_key: str):
        "Transfer all indicator package metadata to the window."
        if pkg_key not in cls.__registered_indicators__:
            log.warning(
                "Cannot update indicator package metadata. Package key '%s' is unknown.",
                pkg_key,
            )
            return

        cls._fwd_queue.put((JS_CMD.UPDATE_IND_PKG, pkg_key, cls.__registered_indicators__[pkg_key]))

    def request_indicator(self, pkg_key: str, ind_key: str):
        "Request that an Indicator instance be loaded and connected to this Indicator Object"
        cls = retrieve_indicator_cls(pkg_key, ind_key)
        if cls is not None:
            cls(parent=self)

    def init_menu(self, opts: IndicatorOptions):
        "Initilize Options Menu with the given Options. Must be called to use UI Options Menu"
        if self.__options__ is None:
            log.error("Cannot set Menu, %s needs an options Class", self.cls_name)
            return

        self._fwd_queue.put(
            (
                JS_CMD.SET_INDICATOR_MENU,
                *self._ids,
                self.__options__.__menu_struct__,
                opts.to_dict(),
            )
        )

    def update_menu(self, opts: IndicatorOptions):
        "Update the Options shown in the UI Menu. Only effective when called after init_menu()"
        if self.__options__ is None:
            log.error("Cannot set Menu, %s needs an options Class", self.cls_name)
            return

        self._fwd_queue.put((JS_CMD.SET_INDICATOR_OPTIONS, *self._ids, opts.to_dict()))

    def set_label(self, label: str):
        "Set the label text for this indicator in the pane's Legend. Raw HTML Accepted"
        self._fwd_queue.put((JS_CMD.SET_LEGEND_LABEL, *self._ids, label))

    def get_primitives_of_type[T: pr.PrimitiveBase](self, _type: type[T]) -> dict[str, T]:
        "Returns a Dictionary of Primitives owned by this indicator of the Given Type"
        if _type == pr.PrimitiveBase:
            return self._primitives.copy()  # type: ignore (ID_Dict is still a dict.)
        rtn_dict = {}
        for _key, _primitive in self._primitives.items():
            if isinstance(_primitive, _type):
                rtn_dict[_key] = _primitive
        return rtn_dict

    def get_series_of_type[T: sc.SeriesCommon](self, _type: type[T]) -> dict[str, T]:
        "Returns a Dictionary of Series Objects owned by this indicator of the Given Type"
        if _type == sc.SeriesCommon:
            return self._series.copy()  # type: ignore (ID_Dict is still a dict.)
        rtn_dict = {}
        for _key, _series in self._series.items():
            if isinstance(_series, _type):
                rtn_dict[_key] = _series
        return rtn_dict

    def delete_primitives(self, _type: type = pr.PrimitiveBase):
        """
        Deletes all Primitives owned by this indicator of the given type.
        If no argument is given, all of the primitives will be deleted.
        """
        for _primitive in self._primitives.copy().values():
            if isinstance(_primitive, _type):
                _primitive.delete()

    def delete_series(self, _type: type = sc.SeriesCommon):
        """
        Deletes all Series owned by this indicator of the given type.
        If no argument is given, all of the Series will be deleted.
        """
        for _series in self._series.copy().values():
            if isinstance(_series, _type):
                _series.delete()

    def bar_time(self, index: int) -> pd.Timestamp:
        """
        Get the timestamp at a given bar index. Negative indices are valid and will start at
        the last bar time.

        The returned timestamp will always be bound to the limits of the underlying dataset
        e.g. [FirstBarTime, LastBarTime]. If no underlying data exists 1970-01-01[UTC] is returned.

        The index may be up to 500 bars into the future, though this timestamp is not guaranteed to
        always remain valid depending on the data received. This can cause Primitives to de-render.

        For example, say the projected time of the next bar is 4:15pm and we draw a Primitive at
        that timestamp. The next piece of bar data is received with an opening time of 5PM so the
        4:15PM Bar is skipped. The Library will remove the Whitespace between 4:15PM and 5PM so
        the chart doesn't have visible gaps. If the Primitive is still supposed to be drawn at
        4:15PM, it will de-render until a valid timestamp is given.
        """
        # TODO: Add a nearest_bar_time function to primitive-base to ensure primitives render
        # negating the need for the above comment.
        return self.parent_frame.timeseries.bar_time(index)


# pylint: disable=invalid-name
IndParent_T: TypeAlias = "win.ChartingFrame | Indicator"

# endregion


def retrieve_indicator_cls(pkg_key: str, ind_key: str) -> type[Indicator] | None:
    "Return an Indicator Subclass from a given package and indicator key Lazy Loading as needed."
    access_key = pkg_key + "_" + ind_key

    if access_key in Indicator.__loaded_indicators__:
        return Indicator.__loaded_indicators__[access_key]

    if pkg_key not in Indicator.__registered_indicators__:
        log.warning("Requested Indicator but package [%s] is not known.", pkg_key)
        return
    if ind_key not in Indicator.__registered_indicators__[pkg_key].indicators:
        log.warning(
            "Requested Indicator [%s] but it is not in package [%s].",
            ind_key,
            pkg_key,
        )
        return

    mdata = Indicator.__registered_indicators__[pkg_key].indicators[ind_key]
    module_path, cls_name = mdata.entry_point.split(":")
    ind_cls: "type[Indicator]" = getattr(import_module(module_path), cls_name)
    Indicator.__loaded_indicators__[access_key] = ind_cls

    return ind_cls
