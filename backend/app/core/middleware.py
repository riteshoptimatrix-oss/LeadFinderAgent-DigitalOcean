import time
import uuid
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.logger import logger


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        # Helmet-like Secure Headers
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Generate unique request ID
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id

        start_time = time.time()
        path = request.url.path
        method = request.method

        # Suppress verbose health-check logging
        is_health = "/health" in path

        try:
            response = await call_next(request)
            duration = time.time() - start_time

            # Inject request ID into response headers
            response.headers["X-Request-ID"] = request_id

            if not is_health:
                logger.info(
                    "request_completed",
                    extra={
                        "request_id": request_id,
                        "method": method,
                        "path": path,
                        "status_code": response.status_code,
                        "duration_s": round(duration, 4),
                    }
                )
            return response
        except Exception as e:
            duration = time.time() - start_time
            logger.error(
                "request_failed",
                extra={
                    "request_id": request_id,
                    "method": method,
                    "path": path,
                    "duration_s": round(duration, 4),
                    "error": str(e),
                    "error_type": type(e).__name__,
                }
            )
            raise


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests with bodies larger than the configured maximum."""

    def __init__(self, app, max_size_mb: int = 10):
        super().__init__(app)
        self.max_size_bytes = max_size_mb * 1024 * 1024

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.max_size_bytes:
            from starlette.responses import JSONResponse
            return JSONResponse(
                status_code=413,
                content={
                    "status": "error",
                    "error": {
                        "code": "PAYLOAD_TOO_LARGE",
                        "message": f"Request body exceeds maximum allowed size of {self.max_size_bytes // (1024 * 1024)}MB"
                    }
                }
            )
        return await call_next(request)
