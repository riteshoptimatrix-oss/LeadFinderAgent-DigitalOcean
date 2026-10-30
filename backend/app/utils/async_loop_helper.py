import asyncio
import sys
import threading
from typing import Any, Callable, Coroutine

def is_proactor_needed() -> bool:
    if sys.platform != "win32":
        return False
    try:
        loop = asyncio.get_running_loop()
        return not isinstance(loop, getattr(asyncio, "ProactorEventLoop", ()))
    except RuntimeError:
        return False

async def run_in_proactor(coro_fn: Callable[..., Coroutine], *args, **kwargs) -> Any:
    """Runs an async function that requires subprocess support (e.g. Playwright)
    on a dedicated ProactorEventLoop thread if current loop is SelectorEventLoop on Windows.
    """
    if not is_proactor_needed():
        return await coro_fn(*args, **kwargs)

    proactor_loop = asyncio.ProactorEventLoop()
    ready = threading.Event()

    def _runner():
        asyncio.set_event_loop(proactor_loop)
        ready.set()
        proactor_loop.run_forever()

    th = threading.Thread(target=_runner, daemon=True, name="ProactorPlaywrightThread")
    th.start()
    ready.wait()

    try:
        fut = asyncio.run_coroutine_threadsafe(coro_fn(*args, **kwargs), proactor_loop)
        return await asyncio.wrap_future(fut)
    finally:
        if proactor_loop.is_running():
            proactor_loop.call_soon_threadsafe(proactor_loop.stop)
        th.join(timeout=3.0)

