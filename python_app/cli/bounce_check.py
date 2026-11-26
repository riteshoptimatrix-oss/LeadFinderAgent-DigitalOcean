"""
cli/bounce_check.py - IMAP bounce detector (cron script).
Usage: python cli/bounce_check.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from db import get_db
from services.bounce_detector import run_bounce_check
from services.logger import AppLogger


def main() -> int:
    log = AppLogger("bounce_check")
    conn = get_db()
    log.info("Starting IMAP bounce check...")
    res = run_bounce_check(conn)
    log.info(res["message"])
    conn.close()
    return 0 if res["success"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
