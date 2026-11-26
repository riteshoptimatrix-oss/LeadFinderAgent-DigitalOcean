"""
db.py - MySQL / MariaDB connection and settings helpers using PyMySQL.
"""
import pymysql
from pymysql.cursors import DictCursor
import config


def get_db():
    """Create and return a PyMySQL connection with DictCursor."""
    return pymysql.connect(
        host=config.DB_HOST,
        port=config.DB_PORT,
        user=config.DB_USER,
        password=config.DB_PASS,
        database=config.DB_NAME,
        charset=config.DB_CHARSET,
        cursorclass=DictCursor,
        autocommit=True,
    )


def settings_get(conn, key: str) -> str:
    """Read a value from the `settings` table. Returns '' if not found."""
    with conn.cursor() as cur:
        cur.execute("SELECT `value` FROM settings WHERE `key` = %s LIMIT 1", (key,))
        row = cur.fetchone()
        return str(row["value"]) if row and row["value"] is not None else ""


def settings_set(conn, key: str, value: str) -> None:
    """Insert or update a value in the `settings` table."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO settings (`key`, `value`) VALUES (%s, %s)
            ON DUPLICATE KEY UPDATE `value` = %s, updated_at = NOW()
            """,
            (key, value, value),
        )
