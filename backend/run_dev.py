import sys
import asyncio
import uvicorn

if __name__ == "__main__":
    if sys.platform == "win32":
        try:
            import asyncio.windows_events as we
            _orig_register = we.IocpProactor._register_with_iocp

            def _safe_register_with_iocp(self, obj):
                try:
                    _orig_register(self, obj)
                except OSError as exc:
                    # [WinError 87] The parameter is incorrect: socket handle already associated with IOCP
                    if getattr(exc, 'winerror', None) == 87 or getattr(exc, 'errno', None) == 87:
                        if hasattr(self, '_registered'):
                            self._registered.add(obj)
                        return
                    raise

            we.IocpProactor._register_with_iocp = _safe_register_with_iocp
        except Exception:
            pass

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

    print("Starting Uvicorn with Playwright-compatible ProactorEventLoop...")
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True, loop="asyncio")
