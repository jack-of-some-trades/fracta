"""Meta Classes for Both the Indicator and IndicatorOptions Class"""

from dataclasses import dataclass
from enum import Enum
from abc import ABCMeta
from importlib.metadata import entry_points
from logging import getLogger
from inspect import Signature, signature, _empty
from types import NoneType
from typing import (
    Dict,
    Optional,
    Any,
    Callable,
    Tuple,
    get_args,
    get_origin,
)

import pandas as pd

from ..types import Color
from ..util import is_dunder

log = getLogger("fracta_log")

# region  --------------- Indicator Package MetaData  ---------------


@dataclass(slots=True)
class IndicatorDetails:
    "JSON Formatting Dataclass for transferring indicator specific info to the screen"

    ind_key: str
    ind_name: str
    ind_version: str | None
    unlisted: bool | None
    description: str | None
    entry_point: str


@dataclass(slots=True)
class IndicatorPackage:
    "JSON Formatting Dataclass for transferring indicator pkg info to the screen"

    pkg_key: str
    pkg_name: str
    pkg_version: str
    description: str | None
    indicators: Dict[str, IndicatorDetails]


# endregion


# region --------------- --------------- Indicator Metaclass --------------- ---------------
class IndicatorMeta(ABCMeta):
    "Metaclass that creates class parameters based on an Indicator's implementation"

    def __new__(mcs, name, bases, namespace, /, **kwargs):
        # Allow ABCMeta to create the class
        cls = super().__new__(mcs, name, bases, namespace, **kwargs)

        if name != "Indicator":
            analyse_indicator_subclass(cls, name, namespace)
            return cls

        # BaseClass Initlization, go ahead and retreive all installed indicator pkg metadata.
        pkg_details = parse_indicator_pkgs()
        pkg_details |= {  # Merge in the baseline UserIndicators Package Group
            "__user_indicators": IndicatorPackage(
                "__user_indicators",
                "User Indicators",
                "",
                "Indicators Manually Imported at Runtime",
                {},
            )
        }
        setattr(cls, "__registered_indicators__", pkg_details)
        setattr(cls, "__loaded_indicators__", {})

        return cls


def parse_indicator_pkgs() -> dict[str, IndicatorPackage]:
    """
    Load indicator package Entry-Points and parse the metadata. Return '__registered_indicators__'
    and the indicators that are to be loaded at launch.
    """
    pkg_details = {}

    for pkg in entry_points(group="fracta.indicator_pkg"):
        # Build the key from the installed package name, not the name given in the meta data to
        # reduce chance of dupicate package names.
        if pkg.dist is None:
            raise ModuleNotFoundError(
                "Attempted to load Fracta indicator package, but the package doesn't have a distribution?"
            )

        pkg_key = pkg.dist.name.lower().replace(" ", "_")
        pkg_info = pkg.load()
        indicator_map = {}

        for ind in pkg_info["indicators"]:
            if ind.get("unlisted") is True:
                continue

            ind_key = ind["name"].lower().replace(" ", "_")
            indicator_map[ind_key] = IndicatorDetails(
                ind_key,
                ind["name"],
                ind.get("version"),
                ind.get("unlisted"),
                ind.get("description"),
                ind["entry_point"],
            )

        if pkg_key in pkg_details:
            log.error(
                "Multiple Indicator Packages installed under the distribution name %s. One of "
                "them will be overwritten by the other.",
                pkg.name,
            )

        pkg_details[pkg_key] = IndicatorPackage(
            pkg_key,
            pkg_info["name"],
            pkg_info["version"],
            getattr(pkg_info, "description", None),
            indicator_map,
        )

    return pkg_details


# --------------- Indicator Subclass parsing functions ---------------


def analyse_indicator_subclass(cls: type, name: str, namespace: dict):
    "Construct Various Dunder Attributes used by the Indicator Class"
    # Place the Signatures of these functions into Class Attributes. These Attributes
    # will be used by the Watcher and others for indicator on indicator integration.
    set_sig = signature(getattr(cls, "set_data", lambda: None))
    if len(set_sig.parameters) <= 1:
        raise TypeError(f"{name}.set_data() must take at least 1 argument")
    set_args = parse_input_args(set_sig)
    setattr(cls, "__set_args__", set_args)

    update_sig = signature(getattr(cls, "update_data", lambda: None))
    if len(update_sig.parameters) <= 1:
        raise TypeError(f"{name}.update_data() must take at least 1 argument")
    update_args = parse_input_args(update_sig)
    setattr(cls, "__update_args__", update_args)

    for _param in set(set_args.keys()).intersection(update_args.keys()):
        if set_args[_param][0] != update_args[_param][0]:
            raise TypeError(f"{cls} reused input argument name '{_param}' but changed the argument type.")
    setattr(cls, "__input_args__", dict(set_args, **update_args))

    # Populate Dunders, Note: all Dunders are defined by the Indicator Base Class.
    # and all dunders set via setattr() are subclass specific and don't cross contaminate.
    outputs, default_out = parse_output_type(name, namespace)
    setattr(cls, "__exposed_outputs__", outputs)
    setattr(cls, "__default_output__", default_out)

    if getattr(cls, "__registered__", False):
        # Indictor flagges as part of a package, metadata already known
        return cls

    # No Metadata exists => a user imported their Indicator from a local path.
    # Populate the Indicator information into the 'user_indicators' package
    ind_key = name.lower().replace(" ", "_")
    access_key = "__user_indicators_" + ind_key
    details = IndicatorDetails(
        ind_key,
        name,
        str(getattr(cls, "__version__", "")),
        None,
        getattr(cls, "__doc__", None),
        "",  # No Entry Point needed since it's already loaded
    )

    cls.__loaded_indicators__[access_key] = cls
    cls.__registered_indicators__["__user_indicators"].indicators[ind_key] = details

    # pylint: disable=protected-access
    # Indicator has been imported sometime after the window has been made. Update the window.
    if cls._fwd_queue is not None:
        cls.__update_ind_pkg__("__user_indicators")

    return cls


def parse_input_args(sig: Signature) -> dict[str, tuple[type, Any]]:
    "Parse Set_Data & Update_Data Function Signatures into {param name: [type , default value]}"
    args = {}
    for pos, (name, _param) in enumerate(sig.parameters.items()):

        if _param.kind == _param.VAR_POSITIONAL or _param.kind == _param.VAR_KEYWORD or pos == 0:
            continue  # Skip the Self Parameter & Variadics

        if _param.kind == _param.POSITIONAL_ONLY:
            raise TypeError(
                "Indicator Set/Update Methods Cannot Use Position Only Args."
            )  # Look, i'm not gonna code the Watcher to dance around that shit.

        param_default = _param.default
        param_type = object if isinstance(_param.annotation, _empty) else _param.annotation

        args[name] = (param_type, param_default)

    return args


def parse_output_type(cls_name, namespace) -> Tuple[dict[str, type], Optional[Callable]]:
    "Parse the return signatures of output properties"
    outputs = {}
    __default_output__ = None
    for output_name, output_func in namespace.items():
        if not getattr(output_func, "__expose_param__", False):
            continue
        if not callable(output_func):
            log.warning("%s.%s must be a callable function", cls_name, output_name)
            continue
        output_func_sig = signature(output_func)
        if len(output_func_sig.parameters) > 1:
            log.warning("%s.%s cannot take args.", cls_name, output_name)
            continue

        rtn_type = output_func_sig.return_annotation

        outputs[output_name] = "any" if isinstance(rtn_type, _empty) else str(rtn_type)

        if getattr(output_func, "__default_param__", False) and rtn_type == pd.Series:
            # Default output must be a single series for consistency
            # May change this to default_output_series & default_output_dataframe
            __default_output__ = output_func

    return outputs, __default_output__


# endregion

# region --------------- --------------- Options Metaclass --------------- ---------------


class OptionsMeta(type):
    """
    Metaclass to parse the dataclass and create a __menu_struct__ and __src_args__ Dict.
    __src_args__ store the argument type for source functions to aide in the transfer of
    this information to the screen and back (Since functions aren't pickleable)

    Used in conjunction with param() this Meta class creates a __menu_struct__ dict that
    can define Groups, inlines, and tooltips for the UI Menu.
    """

    def __new__(mcs, name, bases, namespace, /, **kwargs):
        cls = super().__new__(mcs, name, bases, namespace, **kwargs)
        if name == "IndicatorOptions":
            return cls

        arg_params = namespace.get("__arg_params__")
        args = [key for key in namespace.keys() if not is_dunder(key)]

        # -------- Check that there are no extra dunder variables -------- #
        std_dunders = {
            "__doc__",
            "__annotations__",
            "__qualname__",
            "__module__",
            "__arg_params__",
            "__static_attributes__",
            "__firstlineno__",
        }
        if len(set(namespace.keys()).difference(set(args)).difference(std_dunders)) > 0:
            raise AttributeError(
                "Indicator Options cannot use Dunder Variable Names, Found:"
                f"{set(namespace.keys()).difference(set(args)).difference(std_dunders)}"
            )

        # -------- Check that every non-dunder has a default value -------- #
        __annotations__ = namespace.get("__annotations__")
        if __annotations__ is None:
            __annotations__ = {}

        if not set(args).issuperset(set(__annotations__)):
            raise AttributeError(f"Cannot init '{name}' All Parameters must have a default value.")
        if not set(args).issubset(set(__annotations__)):
            raise AttributeError(
                f"""
                Cannot init '{name}' Parameters must have a type annotation
                **Dataclass will not create an init input arg without one**
                An Ellipsis (...) can be used as an Any Type.
                """
            )

        # ------ Populate __menu_struct__ and __args__ ------ #
        __arg_types__ = {}
        __src_types__ = {}
        __menu_struct__ = {}
        # __menu_struct__ === {  Name: (type, *args*) } ** used to generate JS menu
        # Where type can be [bool, int, float, str, Timestamp, enum, source, group, inline]
        # if type is an inline or group then *args* is another Dict of { Name: (type, *args*) }
        # Groups can Nest Inlines, but not other groups, inlines cannot nest other inlines

        # __arg_types__ = { arg_name : arg_type } ** mapped argument types to aid reconstruction of
        # a dataclass object from a dictionary of values

        # __src_types__ = { arg_name : src_type } ** mapped source type for functions to type
        # check data linkages

        for i, arg_key in enumerate(args):
            # if the Arg is an Object (like Color) then dataclasses requires a Field.
            # Convert that Field back to the default arg we need before continuing.
            if arg := getattr(namespace[arg_key], "default_factory", None):
                namespace[arg_key] = arg()
            elif arg := getattr(namespace[arg_key], "default", None):
                namespace[arg_key] = arg

            arg_type, src_type = _process_type(namespace[arg_key], __annotations__[arg_key])

            __arg_types__[arg_key] = arg_type
            if arg_type == "source":
                __src_types__[arg_key] = src_type
            if arg_type == "enum":
                # Store a reference to the Enum Class for reconstruction
                __src_types__[arg_key] = type(namespace[arg_key])

            # Place var in the global space if there was no param() call.
            if (alt_arg_name := f"@arg{i}") not in arg_params:
                arg_struct = _parse_arg(arg_key, namespace[arg_key], arg_type, src_type)
                __menu_struct__[arg_key] = (arg_type, arg_struct)
                continue

            # Param() call on this arg. Fetch the Param() Options
            arg_param = arg_params[alt_arg_name]
            arg_struct = _parse_arg_param(arg_key, namespace[arg_key], arg_type, src_type, arg_param)

            # region  -- Place the argument at appropriate inline and group position --
            group = arg_param["group"]
            inline = arg_param["inline"]
            if group is not None:
                # Ensure Group has been made in the menu_struct
                if group not in __menu_struct__:
                    __menu_struct__[group] = ("group", {})

                if inline is None:
                    # Place arg into the Group
                    __menu_struct__[group][1][arg_key] = (arg_type, arg_struct)
                else:
                    # Ensure inline has been made in the group
                    if inline not in __menu_struct__[group][1]:
                        __menu_struct__[group][1][inline] = ("inline", {})

                    # Place arg into the Group and inline
                    __menu_struct__[group][1][inline][1][arg_key] = (
                        arg_type,
                        arg_struct,
                    )

            elif inline is not None:
                # Ensure inline has been made in the menu_struct
                if inline not in __menu_struct__:
                    __menu_struct__[inline] = ("inline", {})

                # Place arg into the inline
                __menu_struct__[inline][1][arg_key] = (arg_type, arg_struct)

            else:
                # Place arg directly into the menu_struct
                __menu_struct__[arg_key] = (arg_type, arg_struct)

            # endregion

        setattr(cls, "__arg_types__", __arg_types__)
        setattr(cls, "__src_types__", __src_types__)
        setattr(cls, "__menu_struct__", __menu_struct__)
        return cls


# --------------- Indicator Options parsing functions ---------------


def _parse_arg_param(
    arg_key: str,
    arg: Any,
    arg_type: str,
    src_arg: str,
    arg_params: Any,
) -> dict:
    "Create __menu_struct__ args from a parameter that has param() arguments"
    rtn_struct = {
        "default": arg,
        "tooltip": arg_params["tooltip"],
        "options": arg_params["options"],
        "autosend": arg_params["autosend"],
    }

    rtn_struct["title"] = arg_key if arg_params["title"] is None else arg_params["title"]

    if arg_type == "source":  # ------------------------------------------------
        rtn_struct["src_type"] = src_arg

    elif arg_type == "number":  # ----------------------------------------------
        rtn_struct["min"] = arg_params["min"]
        rtn_struct["max"] = arg_params["max"]
        rtn_struct["step"] = arg_params["step"]
        rtn_struct["slider"] = arg_params["slider"]

    elif arg_type == "enum":  # ------------------------------------------------
        # Remap all of the Enums to be their name
        rtn_struct["default"] = arg.name
        if arg_params["options"] is not None:
            # Ensure the default is in the options list
            if arg not in arg_params["options"]:
                arg_params["options"] = [arg, *arg_params["options"]]

            rtn_struct["options"] = [e.name for e in arg_params["options"]]
        else:
            rtn_struct["options"] = [e.name for e in type(arg)]  # type: ignore

    # elif arg_type == "bool":
    # elif arg_type == "timestamp":

    return rtn_struct


def _parse_arg(arg_key: str, arg: Any, arg_type: str, src_arg: str) -> dict:
    "Create __menu_struct__ args from a parameter that had no param() call"

    rtn_struct = {"title": arg_key, "default": arg, "autosend": True}

    if arg_type == "source" and src_arg != "":
        rtn_struct["src_type"] = src_arg

    # If given an Enum, Auto Populate an Options list
    elif isinstance(arg, Enum):
        rtn_struct["default"] = arg.name
        rtn_struct["options"] = [e.name for e in type(arg)]

    return rtn_struct


def _process_type(arg: Any, arg_type: type) -> Tuple[str, str]:
    if arg_type == Ellipsis or arg_type == Any:
        arg_type = type(arg)

    origin = get_origin(arg_type)
    if origin is list:
        raise TypeError("Indicator Option Type Cannot be a List")
    if origin is dict:
        raise TypeError("Indicator Option Type Cannot be a Dict")

    type_base_clss = set(get_args(arg_type))

    # Strip Optional / Union[None] Types from type _annotation_
    if is_optional := NoneType in type_base_clss:
        type_base_clss = type_base_clss.difference({NoneType})

    if len(type_base_clss) == 1:
        arg_type = (*type_base_clss,)[0]
    elif len(type_base_clss) > 1:
        raise TypeError("Indicator Option Type Cannot be a Union of Types")

    type_str = ""
    src_type = ""

    # Bit nasty of an if statement, but it standardizes the names.
    # Differentiating between classes and callables is annoying
    if arg_type == int or arg_type == float:
        type_str = "number"
    elif arg_type == str:
        type_str = "string"
    elif arg_type == bool:
        type_str = "bool"
    elif arg_type == pd.Timestamp:
        type_str = "timestamp"
    elif len(type_base_clss) == 0:
        if issubclass(arg_type, Enum):
            type_str = "enum"
        elif arg_type == Color:
            type_str = "color"
        elif arg_type == NoneType:
            raise TypeError("Indicator Option Type cannot NoneType")
        else:
            raise TypeError(f"{arg_type} is not compatible with IndicatorOptions Dataclass")
    elif len(type_base_clss) == 1:
        inputs, outputs = get_args(arg_type)
        if len(inputs) > 0:
            raise TypeError("Indicator Callables/Sources cannot require an input argument")
        type_str = "source"
        src_type = str(outputs)
    else:
        raise TypeError(f"Unknown Indicator Option Type: {arg_type = }")

    if (is_optional or arg is None) and type_str != "source":
        raise TypeError("Indicator Option Default Value/Type cannot be None/Optional unless it's a callable")

    return type_str, src_type


# endregion
