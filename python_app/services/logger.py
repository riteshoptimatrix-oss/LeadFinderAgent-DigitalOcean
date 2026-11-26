"""
services/logger.py - Timestamped file + stdout logger matching PHP Logger.
"""
from datetime import datetime
from pathlib import Path
import config


class AppLogger:
    """Writes timestamped log lines to LOG_DIR/<name>-YYYY-MM-DD.log and stdout."""

    def __init__(self, name: str):
        self.name = name
        log_dir = Path(config.LOG_DIR)
        log_dir.mkdir(parents=True, exist_ok=True)
        self.log_file = log_dir / f"{name}-{datetime.now().strftime('%Y-%m-%d')}.log"

    def info(self, message: str) -> None:
        self._write("INFO", message)

    def warn(self, message: str) -> None:
        self._write("WARN", message)

    def error(self, message: str) -> None:
        self._write("ERROR", message)

    def _write(self, level: str, message: str) -> None:
        line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [{self.name}] [{level}] {message}\n"
        with open(self.log_file, "a", encoding="utf-8") as f:
            f.write(line)
        print(line, end="")
