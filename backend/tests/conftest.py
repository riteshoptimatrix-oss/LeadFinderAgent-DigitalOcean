import pytest
from httpx import AsyncClient
from motor.motor_asyncio import AsyncIOMotorClient

from app.main import app
from app.core.config import settings
from app.db.database import get_db

TEST_MONGO_URL = settings.MONGODB_URL
TEST_DB_NAME = "lead_finder_test_db"

# Custom event_loop fixture commented out to fix pytest-asyncio scope conflicts
# @pytest.fixture(scope="session")
# def event_loop():
#     loop = asyncio.get_event_loop_policy().new_event_loop()
#     yield loop
#     loop.close()

@pytest.fixture
async def db_client():
    client = AsyncIOMotorClient(TEST_MONGO_URL)
    yield client
    # Clean up test database after all tests
    await client.drop_database(TEST_DB_NAME)
    client.close()

@pytest.fixture
async def db(db_client):
    from app.db.database import db_instance
    # Clear collections before each test for isolation
    db = db_client[TEST_DB_NAME]
    db_instance.db = db
    collections = await db.list_collection_names()
    for col in collections:
        await db[col].delete_many({})
    yield db
    db_instance.db = None

@pytest.fixture
async def client(db):
    # Override get_db dependency
    app.dependency_overrides[get_db] = lambda: db
    from httpx import ASGITransport
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
