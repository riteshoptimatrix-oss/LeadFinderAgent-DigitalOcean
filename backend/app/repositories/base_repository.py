from motor.motor_asyncio import AsyncIOMotorDatabase
from app.db.database import get_db, db_instance

class BaseRepository:
    """Base repository sharing a single MongoDB connection."""
    
    def __init__(self, db: AsyncIOMotorDatabase = None):
        self._db = db

    @property
    def db(self) -> AsyncIOMotorDatabase:
        if self._db is not None:
            return self._db
        return get_db()
