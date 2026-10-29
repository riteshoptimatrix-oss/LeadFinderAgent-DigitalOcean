import logging
import sys
import os
from datetime import datetime, timezone

try:
    from pythonjsonlogger.json import JsonFormatter
    HAS_JSON_LOGGER = True
except ImportError:
    HAS_JSON_LOGGER = False


class StructuredFormatter(logging.Formatter):
    """Fallback structured formatter when python-json-logger is not available."""
    def format(self, record):
        record.timestamp = datetime.now(timezone.utc).isoformat()
        record.level = record.levelname
        record.module_name = record.module
        return super().format(record)


def setup_logger(name: str) -> logging.Logger:
    _logger = logging.getLogger(name)
    _logger.setLevel(logging.DEBUG)

    # Prevent duplicate handlers on re-import
    if _logger.handlers:
        return _logger

    # ── Console Handler ──────────────────────────────────────────────────
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.DEBUG)

    if HAS_JSON_LOGGER:
        json_fmt = JsonFormatter(
            fmt="%(asctime)s %(name)s %(levelname)s %(message)s %(module)s %(funcName)s %(lineno)d",
            rename_fields={
                "asctime": "timestamp",
                "levelname": "level",
                "name": "logger",
                "funcName": "function",
                "lineno": "line",
            },
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
        console_handler.setFormatter(json_fmt)
    else:
        plain_fmt = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - [%(module)s:%(funcName)s:%(lineno)d] %(message)s"
        )
        console_handler.setFormatter(plain_fmt)

    _logger.addHandler(console_handler)

    # ── File Handler (Rotating) ──────────────────────────────────────────
    try:
        log_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "logs")
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, "app.log")

        from logging.handlers import RotatingFileHandler
        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=10 * 1024 * 1024,  # 10 MB
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setLevel(logging.DEBUG)

        if HAS_JSON_LOGGER:
            file_json_fmt = JsonFormatter(
                fmt="%(asctime)s %(name)s %(levelname)s %(message)s %(module)s %(funcName)s %(lineno)d",
                rename_fields={
                    "asctime": "timestamp",
                    "levelname": "level",
                    "name": "logger",
                    "funcName": "function",
                    "lineno": "line",
                },
                datefmt="%Y-%m-%dT%H:%M:%S%z",
            )
            file_handler.setFormatter(file_json_fmt)
        else:
            file_handler.setFormatter(plain_fmt)

        _logger.addHandler(file_handler)
    except Exception:
        # If file logging fails (e.g., permissions), continue with console only
        pass

    return _logger


logger = setup_logger("lead_finder_agent")
app_logger = setup_logger("app")



def log_lifecycle(event: str, job_id: str = "N/A", worker_id: str = "N/A", browser_id: str = "N/A", context_id: str = "N/A", correlation_id: str = "N/A", **kwargs):
    import json
    from datetime import datetime
    log_data = {
        "event": event,
        "job_id": job_id or "N/A",
        "worker_id": worker_id or "N/A",
        "browser_id": browser_id or "N/A",
        "context_id": context_id or "N/A",
        "correlation_id": correlation_id or "N/A",
        "timestamp": datetime.utcnow().isoformat()
    }
    log_data.update(kwargs)
    logger.info(f"LIFECYCLE_LOG: {json.dumps(log_data)}")

