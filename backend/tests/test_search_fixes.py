import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pymongo.errors import DuplicateKeyError

from app.services.search_engine.playwright_engine import PlaywrightEngine
from app.services.search_engine.query_expander import QueryExpander
from app.services.search_engine.storage import Storage
from app.services.search_engine.ws import ConnectionManager


def test_query_expander_focused_for_small_target():
    queries = QueryExpander.generate_query_plan(
        keyword="Gym",
        area="Hanspura",
        city="Ahmedabad",
        state="Gujarat",
        country="India",
        target_limit=20,
        exhaustive=False,
    )
    assert len(queries) >= 1
    assert len(queries) <= 12
    assert any("Hanspura" in q for q in queries)


def test_ws_broadcast_uses_epoch_timestamp():
    mgr = ConnectionManager()
    sent = []

    class DummyWS:
        async def send_text(self, text: str):
            sent.append(text)

    async def _run():
        mgr.active_connections["job1"] = [DummyWS()]
        await mgr.broadcast_event("job1", "business_discovered", {"business": {"name": "Test"}})

    asyncio.run(_run())
    assert len(sent) == 1
    import json
    payload = json.loads(sent[0])
    assert payload["timestamp"] > 1_700_000_000
    assert abs(payload["timestamp"] - time.time()) < 10


def test_storage_duplicate_key_error_returns_duplicate():
    storage = Storage()
    mock_leads = MagicMock()
    mock_leads.find_one = AsyncMock(return_value=None)
    mock_leads.insert_one = AsyncMock(side_effect=DuplicateKeyError("E11000 duplicate key"))
    mock_db = {"leads": mock_leads}

    raw_data = {
        "name": "Fitness Fuel",
        "phone": "095582 25511",
        "address": "Ahmedabad",
        "url": "https://maps.google.com/?cid=123",
    }

    with patch("app.services.search_engine.storage.get_db", return_value=mock_db):
        res = asyncio.run(storage.save_lead("job1", raw_data, city="Ahmedabad", state="Gujarat", country="India"))
    assert res == "DUPLICATE"


def test_storage_attaches_id_on_insert():
    storage = Storage()
    mock_leads = MagicMock()
    mock_leads.find_one = AsyncMock(return_value=None)
    insert_res = MagicMock()
    insert_res.acknowledged = True
    insert_res.inserted_id = "65f000000000000000000001"
    mock_leads.insert_one = AsyncMock(return_value=insert_res)
    mock_db = {"leads": mock_leads}

    raw_data = {
        "name": "Fitness Fuel",
        "phone": "095582 25511",
        "address": "Ahmedabad",
        "url": "https://maps.google.com/?cid=123",
    }

    with patch("app.services.search_engine.storage.get_db", return_value=mock_db):
        res = asyncio.run(storage.save_lead("job1", raw_data, city="Ahmedabad", state="Gujarat", country="India"))
    assert res == "INSERTED"
    assert raw_data["_id"] == "65f000000000000000000001"
    assert raw_data["google_maps_url"] == "https://maps.google.com/?cid=123"


def test_playwright_engine_init():
    eng = PlaywrightEngine()
    assert eng._popups_checked is False
