from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError as PydanticValidationError
from datetime import datetime
from app.core.logger import logger
import traceback
import uuid

class APIError(Exception):
    """Base API Error class with structured response"""
    def __init__(
        self, 
        status_code: int, 
        error_code: str,
        message: str, 
        details: dict = None
    ):
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.details = details or {}
        super().__init__(self.message)

class BadRequestError(APIError):
    def __init__(self, message: str, details: dict = None):
        super().__init__(400, "BAD_REQUEST", message, details)

class UnauthorizedError(APIError):
    def __init__(self, message: str = "Unauthorized", details: dict = None):
        super().__init__(401, "UNAUTHORIZED", message, details)

class ForbiddenError(APIError):
    def __init__(self, message: str = "Forbidden", details: dict = None):
        super().__init__(403, "FORBIDDEN", message, details)

class NotFoundError(APIError):
    def __init__(self, message: str, details: dict = None):
        super().__init__(404, "NOT_FOUND", message, details)

class ConflictError(APIError):
    def __init__(self, message: str, details: dict = None):
        super().__init__(409, "CONFLICT", message, details)

class ValidationError(APIError):
    def __init__(self, message: str, details: dict = None):
        super().__init__(422, "VALIDATION_ERROR", message, details)

class TooManyRequestsError(APIError):
    def __init__(self, message: str = "Too many requests", details: dict = None):
        super().__init__(429, "TOO_MANY_REQUESTS", message, details)

class InternalServerError(APIError):
    def __init__(self, message: str = "Internal server error", details: dict = None):
        super().__init__(500, "INTERNAL_ERROR", message, details)

def create_error_response(
    status_code: int,
    error_code: str,
    message: str,
    details: dict = None,
    request_id: str = None
):
    """Create standardized error response"""
    return {
        "status": "error",
        "error": {
            "code": error_code,
            "message": message,
            "details": details or {},
        },
        "timestamp": datetime.utcnow().isoformat(),
        "request_id": request_id or str(uuid.uuid4())
    }

def add_exception_handlers(app: FastAPI):
    
    @app.exception_handler(APIError)
    async def api_error_handler(request: Request, exc: APIError):
        """Handle custom API errors"""
        request_id = str(uuid.uuid4())
        logger.warning(
            f"API Error [{request_id}]: {exc.error_code} - {exc.message} "
            f"on {request.method} {request.url}"
        )
        
        return JSONResponse(
            status_code=exc.status_code,
            content=create_error_response(
                status_code=exc.status_code,
                error_code=exc.error_code,
                message=exc.message,
                details=exc.details,
                request_id=request_id
            )
        )
    
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        """Handle FastAPI HTTP exceptions"""
        request_id = str(uuid.uuid4())
        
        # Map status codes to error codes
        error_code_map = {
            400: "BAD_REQUEST",
            401: "UNAUTHORIZED",
            403: "FORBIDDEN",
            404: "NOT_FOUND",
            409: "CONFLICT",
            422: "VALIDATION_ERROR",
            429: "TOO_MANY_REQUESTS",
            500: "INTERNAL_ERROR",
            503: "SERVICE_UNAVAILABLE"
        }
        
        error_code = error_code_map.get(exc.status_code, "HTTP_ERROR")
        
        logger.warning(
            f"HTTP Exception [{request_id}]: {exc.status_code} - {exc.detail} "
            f"on {request.method} {request.url}"
        )
        
        return JSONResponse(
            status_code=exc.status_code,
            content=create_error_response(
                status_code=exc.status_code,
                error_code=error_code,
                message=str(exc.detail),
                request_id=request_id
            )
        )
    
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        """Handle request validation errors"""
        request_id = str(uuid.uuid4())
        
        # Format validation errors
        errors = []
        for error in exc.errors():
            errors.append({
                "field": ".".join(str(loc) for loc in error["loc"]),
                "message": error["msg"],
                "type": error["type"]
            })
        
        logger.warning(
            f"Validation Error [{request_id}]: {len(errors)} errors "
            f"on {request.method} {request.url}"
        )
        
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=create_error_response(
                status_code=422,
                error_code="VALIDATION_ERROR",
                message="Request validation failed",
                details={"errors": errors},
                request_id=request_id
            )
        )
    
    @app.exception_handler(PydanticValidationError)
    async def pydantic_validation_handler(request: Request, exc: PydanticValidationError):
        """Handle Pydantic validation errors (response serialization failures).

        These indicate a mismatch between the Pydantic response model and the
        data being serialized. The error is logged with full details, but the
        client receives a sanitized 500 response so internal shapes are never
        leaked.
        """
        request_id = str(uuid.uuid4())
        error_trace = traceback.format_exc()
        errors = exc.errors()
        logger.error(
            f"RESPONSE_VALIDATION_ERROR [{request_id}]: {len(errors)} field(s) failed "
            f"on {request.method} {request.url}\n{error_trace}"
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=create_error_response(
                status_code=500,
                error_code="RESPONSE_VALIDATION_ERROR",
                message="Response validation failed. The API encountered a data shape mismatch.",
                request_id=request_id
            )
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        """Handle all unhandled exceptions"""
        request_id = str(uuid.uuid4())
        
        # Log full traceback
        error_trace = traceback.format_exc()
        logger.error(
            f"Unhandled Exception [{request_id}]: {type(exc).__name__}: {str(exc)} "
            f"on {request.method} {request.url}\n{error_trace}"
        )
        
        # Don't expose internal error details in production
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=create_error_response(
                status_code=500,
                error_code="INTERNAL_ERROR",
                message="An unexpected error occurred. Please try again later.",
                details={"type": type(exc).__name__},
                request_id=request_id
            )
        )
