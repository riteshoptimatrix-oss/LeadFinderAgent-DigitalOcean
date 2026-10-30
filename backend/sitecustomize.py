import sys

if sys.platform == "win32":
    import asyncio
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        pass

    try:
        import uvicorn.loops.asyncio
        uvicorn.loops.asyncio.asyncio_loop_factory = lambda use_subprocess=False: asyncio.ProactorEventLoop
    except Exception:
        pass

    try:
        import uvicorn.loops.auto
        uvicorn.loops.auto.auto_loop_factory = lambda use_subprocess=False: asyncio.ProactorEventLoop
    except Exception:
        pass

