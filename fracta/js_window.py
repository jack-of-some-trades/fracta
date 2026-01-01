"""Classes and Functions that handle the interface between Python and Javascript"""

import logging
import multiprocessing as mp
from dataclasses import dataclass, field
from inspect import getmembers, ismethod
from multiprocessing.synchronize import Event as mp_EventClass
from os.path import abspath, dirname
from pathlib import Path
from typing import Optional

import webview
from webview.errors import JavascriptException

from .js_cmd import JS_CMD, VIEW_CMD_ROLODEX
from .py_cmd import PY_CMD, WIN_CMD_ROLODEX
from .util import is_dunder

INDEX_HTML_PATH = Path(dirname(abspath(__file__))) / "frontend" / "index.html"
log = logging.getLogger("fracta_log")

# @pylint: disable=consider-iterating-dictionary missing-function-docstring invalid-name

##### --------------------------------- Javascript API Class --------------------------------- #####


class PyAPIBase:
    """
    Base javascript Callback API.
    Every function in this class maps to a function in the PyApi class in py_api.ts and
    thus allows for events/inputs into the Javascript Window to invoke python functions.
    * private, protected, sunder, and dunder methods are *not* placed in the Javascript window
    """

    def __init__(self, rtn_queue: mp.Queue):
        self.rtn_queue = rtn_queue
        self.view_window: PyWv

    def __set_view_window__(self, view_window):
        # For some reason this assignment can't be done in the constructor.
        # If you try that then py_webview never loads? The assignment can only be
        # done after the py_webivew window has loaded
        self.view_window = view_window

    def close(self):
        self.view_window.close()

    def maximize(self):
        self.view_window.maximize()

    def minimize(self):
        self.view_window.minimize()

    def restore(self):
        self.view_window.restore()


# Since Most of the python functions PyAPI needs to invoke are in the primary process we can't call
# them directly. Instead we need to pass the arguments and a relevant PY_CMD code through the
# mp.Queue. Generating these forwarding functions is automated below in the generation of the
# PyApi type using the already defined WIN_CMD_ROLODEX. The only restriction is that the linked
# python and javascript functions must have the exact same signature.


def __py_api_wrapper(cmd: PY_CMD):
    def queue_wrapper(self, *args):
        self.rtn_queue.put((cmd, *args))

    return queue_wrapper


PyApi = type(
    "PyAPI",
    (PyAPIBase,),
    dict(
        (func.__name__, __py_api_wrapper(cmd))  # pyright: ignore[reportAttributeAccessIssue]
        for cmd, func in WIN_CMD_ROLODEX.items()
    ),
)

##### --------------------------------- Python Gui Classes --------------------------------- #####


@dataclass
class MpHooks:
    "All Multiprocessor Hooks required for the javascript Sub-Process interface"

    fwd_queue: mp.Queue = field(default_factory=mp.Queue)
    rtn_queue: mp.Queue = field(default_factory=mp.Queue)
    js_loaded_event: mp_EventClass = field(default_factory=mp.Event)
    stop_event: mp_EventClass = field(default_factory=mp.Event)


class PyWv:
    """
    Class to create and manage a pywebview window

    Args:
        Param: mp_hooks
            A Dataclass struct of all the necessary multiprocessor hooks.
        param: **kwargs
            key-word args that are passed directly to the pywebview window.
            See https://pywebview.flowrl.com/guide/api.html for docs on available kwargs.
    """

    def __init__(
        self,
        mp_hooks: MpHooks,
        title: str = "",
        debug: bool = False,
        log_level: Optional[str | int] = None,
        **kwargs,
    ):
        self.fwd_queue = mp_hooks.fwd_queue
        self.rtn_queue = mp_hooks.rtn_queue
        self.js_loaded_event = mp_hooks.js_loaded_event
        self.stop_event = mp_hooks.stop_event
        self.batch_cmds = True

        self.api = PyApi(self.rtn_queue)
        self.rolodex = {
            JS_CMD.SHOW: self.show,
            JS_CMD.HIDE: self.hide,
            JS_CMD.CLOSE: self.close,
            JS_CMD.MAXIMIZE: self.maximize,
            JS_CMD.MINIMIZE: self.minimize,
            JS_CMD.RESTORE: self.restore,
            JS_CMD.LOAD_CSS: self.load_css,
        }

        if debug:
            self.batch_cmds = False
            log.setLevel(logging.DEBUG)
        # webview.settings["OPEN_DEVTOOLS_IN_DEBUG"] = False
        if log_level is not None:
            log.setLevel(log_level)

        # hide by default since seeing window elements poping in is ugly.
        # Typescript calls API Show function when all elements are loaded.
        if "hidden" not in kwargs.keys():
            kwargs["hidden"] = True
        # Setting default since window has quite a few things populated by default
        if "min_size" not in kwargs.keys():
            kwargs["min_size"] = (400, 250)
        if "width" not in kwargs.keys():
            kwargs["width"] = 1600
        if "height" not in kwargs.keys():
            kwargs["height"] = 800
        if "frameless" not in kwargs.keys():
            kwargs["frameless"] = False
        kwargs["easy_drag"] = False  # REALLY Don't want easy_drag behavior

        self.frameless = kwargs["frameless"]
        if self.frameless:
            webview.DRAG_REGION_SELECTOR = ".frameless-drag-region"
            # Need to do this otherwise a Framed window is draggable
            # and no, you can't just add this class after the window is made..

        self.pyweb_window = webview.create_window(
            title=title,
            url=INDEX_HTML_PATH.as_posix(),
            js_api=self.api,
            **kwargs,
        )

        # Tell webview to execute api func assignment and enter main loop once loaded
        # Order of these function calls matter
        self.pyweb_window.events.loaded += lambda: self.api.__set_view_window__(self)
        self.pyweb_window.events.loaded += self._assign_callbacks
        self.pyweb_window.events.loaded += self._manage_queue
        self.pyweb_window.events.maximized += self._on_maximized
        self.pyweb_window.events.restored += self._on_restore

        # Need private mode so the HTML is always reloaded. W/o it a cached version is loaded.
        webview.start(debug=debug, private_mode=True)
        self.stop_event.set()

    def run_script(self, cmd: str):
        "evaluate_js() and catch errors"
        try:
            # runscript for pywebview is the evaluate_js() function
            # Note: Cannot use the built in callbacks since commands are batched
            self.pyweb_window.evaluate_js(cmd)
        except JavascriptException as e:
            log.error("JS Exception: %s\n\t\t\t\tscript: %s", e.args[0]["message"], cmd)

    def _assign_callbacks(self):
        "Read all the functions that exist in the api and expose non-dunder methods to javascript"
        member_functions = getmembers(self.api, predicate=ismethod)
        for name, _ in member_functions:
            if not is_dunder(name):  # filter out dunder methods
                self._assign_callback(name)

        # Signal to both python and javascript listeners that inital setup is complete
        self.js_loaded_event.set()
        self.show()
        if self.frameless:
            self.run_script("window.api.setFrameless(true);")

    def _assign_callback(self, func_name: str):
        self.run_script(f"window.api.{func_name} = pywebview.api.{func_name};")

    def _manage_queue(self):
        "Infinite loop to manage Process Queue since it is launched in an isolated process"
        batch_cmd, batch_size = "", 0
        while not self.stop_event.is_set():
            # get() doesn't need a timeout & can be completely blocking. the waiting will get interrupted
            # by the os to go manage the thread that the webview is running in. Bit wasteful i think.
            # Would be nice to have pywebview run in an asyncio Thread
            msg = self.fwd_queue.get()
            cmd, *args = msg
            log.debug("Received CMD: %s, args: %s", cmd.name, args)

            try:
                # Lookup JS Command
                cmd_str = VIEW_CMD_ROLODEX[cmd](*args)
            except TypeError as e:
                arg_list = [type(arg) for arg in args]
                log.error(
                    "Command:%s: Given %s \n\tError msg: %s",
                    JS_CMD(cmd).name,
                    arg_list,
                    e,
                )
                continue  # Skip to next Command

            if cmd_str is None:
                self.rolodex[cmd](*args)  # Given a PyWv Command, execute Immediately
            elif self.batch_cmds:
                batch_size += 1
                batch_cmd += cmd_str
            else:
                self.run_script(cmd_str)
                continue

            # Batching is at least 3x faster than running individual cmds and helps prevent the
            # queue from piling up too. The Batch Size Limit exists to limit how much the viewport
            # appears to lockup while being flooded w/ cmds. It is disabled during debug to help
            # isolate problematic commands
            if self.fwd_queue.empty() or batch_size >= 100:
                self.run_script(batch_cmd)
                batch_cmd = ""
                batch_size = 0

    def close(self):
        self.stop_event.set()
        self.pyweb_window.destroy()

    def maximize(self):
        if self.pyweb_window.maximized:
            self.restore()
        else:
            self.pyweb_window.maximize()

    def minimize(self):
        self.pyweb_window.minimize()

    def restore(self):
        self.pyweb_window.restore()

    def show(self):
        self.pyweb_window.show()

    def hide(self):
        self.pyweb_window.hide()

    def load_css(self, filepath: str):
        try:
            file_handle = open(filepath, encoding="UTF-8")
            self.pyweb_window.load_css(file_handle.read())
            self.run_script("window.reloadComputedCanvasStyle();")
        except FileNotFoundError:
            log.error("Cannot find/load .css file. Ensure filepath is absolute.")
        finally:
            file_handle.close()

    def _on_maximized(self):
        # For Some reason maximized doesn't auto update?
        self.pyweb_window.maximized = True
        # self.run_script("") # Should make this update the icon...

    def _on_restore(self):
        self.pyweb_window.maximized = False
        # self.run_script("") # Should make this update the icon...


@dataclass
class PyWebViewOptions:
    """
    All** available 'PyWebview' Create_Window Options

    ** At Somepoint in the future this may be expanded to include server options
    and window.start() Options.
    """

    title: str = ""
    x: int = 100
    y: int = 100
    width: int = 800
    height: int = 600
    resizable: bool = True
    fullscreen: bool = False
    min_size: tuple[int, int] = (400, 250)
    hidden: bool = False
    on_top: bool = False
    confirm_close: bool = False
    background_color: str = "#FFFFFF"
    transparent: bool = False
    text_select: bool = False
    zoomable: bool = False
    draggable: bool = False
    vibrancy: bool = False
    debug: bool = False
    # server
    # server_args
    # localization
