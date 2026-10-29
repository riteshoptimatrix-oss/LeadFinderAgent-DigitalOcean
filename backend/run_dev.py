import sys
import asyncio
import uvicorn

if __name__ == "__main__":
    if sys.platform == "win32":
        # Uvicorn has a known bug/feature on Windows where it forces SelectorEventLoop
        # if --reload is enabled (which sets use_subprocess=True).
        # SelectorEventLoop does not support subprocesses (like Playwright's Chromium).
        # We monkey-patch Uvicorn's loop factory to ALWAYS use ProactorEventLoop.
        import uvicorn.loops.asyncio
        uvicorn.loops.asyncio.asyncio_loop_factory = lambda use_subprocess=False: asyncio.ProactorEventLoop
        
    print("Starting Uvicorn with Playwright-compatible ProactorEventLoop...")
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
