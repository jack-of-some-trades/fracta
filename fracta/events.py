"""Core Machinery of the Event Call & Response System used primarily by indicators"""

from __future__ import annotations
from asyncio import iscoroutinefunction, create_task
from functools import partial
from typing import (
    TYPE_CHECKING,
    Protocol,
    Self,
    TypeAlias,
    Callable,
    Optional,
    Any,
)


from .js_cmd import JS_CMD

if TYPE_CHECKING:
    from .indicators.timeseries.events import (
        Socket_Open_Protocol,
        Socket_Close_Protocol,
        Data_Request_Protocol,
        Symbol_Search_Protocol,
    )
    from .py_window import Window
    from multiprocessing import Queue


class Events:
    "A Super Object that is a Collection of Emitters"

    def __init__(self, window: "Window"):
        self.exec_js = partial(_js_command_sender, window._fwd_queue)
        self.exec_js.__doc__ = _js_command_sender.__doc__
        self.window_callback = Emitter[Callback_Protocol](single_emit=False)

        # Provides typing information for these events since they are built in.
        # The actual event objects are created in the indicators.timeseries.events module 
        # to prevent circular imports.
        if TYPE_CHECKING:
            self.open_socket: Emitter[Socket_Open_Protocol]
            self.close_socket: Emitter[Socket_Close_Protocol]
            self.data_request: Emitter[Data_Request_Protocol]
            self.symbol_search: Emitter[Symbol_Search_Protocol]


# region -------------------------- Python Event Protocol Definitions -------------------------- #
# pylint: disable=invalid-name disable=missing-class-docstring


# Generic Callback from the js_window for user plugins to return arguments
# from the window to be processed by any function listening to the emitter
class Callback_sync(Protocol):
    def __call__(self, kwargs: dict) -> None: ...
class Callback_async(Protocol):
    async def __call__(self, kwargs: dict) -> None: ...


Callback_Protocol: TypeAlias = Callback_sync | Callback_async


def _js_command_sender(queue: "Queue", /, cmd: str):
    "Send JS as a string to the window and execute it in the global namespace"
    queue.put((JS_CMD.JS_CODE, cmd))


# endregion


# Pylint Thinks "T" is undefined.
# pylint: disable=undefined-variable
class Emitter[T: Callable](list[T]):
    """
    Emitter is a list of Sync/Async Callables. It should be instantiated with a Protocol,
    or a union of Protocols, that define the input and output args of the stored callables.

    Emittion Responders can be added via the '+=' operatior. By default the Emitters are single
    emitters. This limits the length of the responder's list to 1 function. When True, only the
    last responder function appended to the list though the '+=' operator will be called.

    When there are multiple responder functions appended to the list all of the async functions
    will be launched in tasks. The remaining blocking functions will then execute in order.

    This class can be instantiated with a response handler function. This function will be
    called with the return args of each function called by the emit event. This responder
    function can be provided static key-word arguments by populating the 'rsp_args' param
    When emitting an event though the Emitter.__call__() function.
    e.g.:
    Emitter_inst() emits a call to all appended functions.
    Emitter_inst(rsp_args=[rsp_kwargs]), calls all appended functions,
    then once each function returns, calls responder_func(*[Event_responder_function_return], **{rsp_kwargs})
    """

    # TODO : Make this class track async tasks that it has created so they can be closed
    # This will likely entail making the class definitively only handle one response function

    def __init__(self, rsp_handler: Optional[Callable] = None, single_emit: bool = True, **kwargs):
        """
        Initilize an Emitter object that can call and respond to Syncronous & Asyncronous functions.

        PARAMS:
            - rsp_handler: Optional[Callable[..., None]]
            The function that is called with any return products of Event Responders added via the
            '+=' operator overload.

            - single_emit: bool
            -True: Allow only one function to responder to be called by the emitted event
            -False: Allow multiple responding functions to be called, each making a call to the
                rsp_handler when returning objects

            - **kwargs: Any
            Additional Kwargs passed will be passed as static kwargs to the responder function after
            and event is emitted. When there is a name collision between the static rsp_kwargs &
            the rsp_kwargs passed at the time of emittion, the dynamic arg is prioritized.

            i.e. the following are equivelent statements.
            my_emitter = Emitter(func, my_arg='arg')
            my_emitter = Emitter(func); my_emitter(rsp_kwargs={'my_arg':'arg'})


        """
        super().__init__()
        self.__single_emitter__ = single_emit
        self.rsp_handler = rsp_handler
        self._static_rsp_kwargs = kwargs

    def __iadd__(self, func: T) -> Self:
        if func not in self:
            if self.__single_emitter__:
                self.clear()
            super().append(func)
        return self

    def append(self, func: T):
        if func not in self:
            if self.__single_emitter__:
                self.clear()
            super().append(func)

    def __isub__(self, func: T) -> Self:
        if func in self:
            self.remove(func)
        return self

    def __call__(self, *args, rsp_kwargs: dict[str, Any] = {}, **kwargs):
        if len(self) == 0:
            return  # No Functions have been appended to this Emitter Yet

        _rsp_kwargs = self._static_rsp_kwargs | rsp_kwargs

        for caller in self:
            if iscoroutinefunction(caller):
                # Run Self, Asynchronously
                create_task(self._async_response_wrap_(caller, *args, **kwargs, rsp_kwargs=_rsp_kwargs))
            else:
                # Run Self, Synchronously
                rsp = caller(*args, **kwargs)
                if self.rsp_handler is None:
                    return

                self.rsp_handler(  # only unpack rsp tuples, not lists
                    *rsp if isinstance(rsp, tuple) else (rsp,),
                    **_rsp_kwargs,
                )

    async def _async_response_wrap_(self, call, *args, rsp_kwargs: Optional[dict[str, Any]] = None, **kwargs):
        "Simple Wrapper to await the initial caller function."
        rsp = await call(*args, **kwargs)
        if self.rsp_handler is None:
            return

        self.rsp_handler(
            *rsp if isinstance(rsp, tuple) else rsp,  # only unpack tuples, not lists
            **rsp_kwargs if rsp_kwargs is not None else {},
        )
