from datetime import datetime, timezone
import io
import os
from pathlib import Path
import pytest
from bson import ObjectId
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.dependencies import get_current_user, get_db
from app.api.routes import media as media_routes
from app.models.user import UserInDB


class _FakeMediaCollection:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        doc = dict(doc)
        if "_id" not in doc:
            doc["_id"] = ObjectId()
        self.docs.append(doc)
        class Res:
            inserted_id = doc["_id"]
        return Res()

    def find(self, query):
        filtered = [d for d in self.docs if d.get("user_id") == query.get("user_id")]
        class Cursor:
            def sort(self, *a, **kw):
                return self
            def limit(self, *a, **kw):
                return self
            async def to_list(self, n):
                return list(filtered)
        return Cursor()

    async def find_one(self, query):
        for d in self.docs:
            if d.get("_id") == query.get("_id") and d.get("user_id") == query.get("user_id"):
                return d
        return None

    async def delete_one(self, query):
        self.docs = [d for d in self.docs if d.get("_id") != query.get("_id")]
        return None


class _FakeDB:
    def __init__(self):
        self._collections = {
            "media_uploads": _FakeMediaCollection(),
        }

    def __getitem__(self, item):
        if item not in self._collections:
            self._collections[item] = _FakeMediaCollection()
        return self._collections[item]


@pytest.fixture
def test_client():
    fake_db = _FakeDB()
    fake_user = UserInDB(
        _id="user123",
        email="testuser@example.com",
        hashed_password="hash",
        role="USER",
        email_automation_access=True,
    )

    app = FastAPI()
    app.include_router(media_routes.router, prefix="/api/v1/media")
    app.dependency_overrides[get_db] = lambda: fake_db
    app.dependency_overrides[get_current_user] = lambda: fake_user

    client = TestClient(app)
    return client, fake_db


def test_upload_image_and_list_and_delete(test_client):
    client, fake_db = test_client

    # 1. Upload valid PNG image
    fake_png = io.BytesIO(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR...")
    res = client.post(
        "/api/v1/media/upload",
        files={"file": ("test_banner.png", fake_png, "image/png")},
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["media_type"] == "image"
    assert "test_banner" in data["filename"]
    assert "/api/v1/uploads/images/" in data["url"]
    media_id = data["id"]

    # 2. Upload valid MP4 video
    fake_mp4 = io.BytesIO(b"\x00\x00\x00 ftypisom...")
    res_v = client.post(
        "/api/v1/media/upload",
        files={"file": ("product_demo.mp4", fake_mp4, "video/mp4")},
    )
    assert res_v.status_code == 200, res_v.text
    data_v = res_v.json()
    assert data_v["media_type"] == "video"
    assert "/api/v1/uploads/videos/" in data_v["url"]

    # 3. List media
    list_res = client.get("/api/v1/media")
    assert list_res.status_code == 200
    items = list_res.json()
    assert len(items) == 2

    # 4. Reject unsupported file extension (.exe)
    bad_res = client.post(
        "/api/v1/media/upload",
        files={"file": ("script.exe", io.BytesIO(b"MZ..."), "application/octet-stream")},
    )
    assert bad_res.status_code == 400
    assert "Unsupported file type" in bad_res.json()["detail"]

    # 5. Delete media
    del_res = client.delete(f"/api/v1/media/{media_id}")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "success"

    # List again -> 1 item left
    list_res2 = client.get("/api/v1/media")
    assert len(list_res2.json()) == 1


def test_upload_base64_media(test_client):
    client, fake_db = test_client
    import base64
    raw_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDRfakeimage"
    b64_str = "data:image/png;base64," + base64.b64encode(raw_bytes).decode("utf-8")

    res = client.post(
        "/api/v1/media/upload-base64",
        json={"filename": "logo.png", "content_base64": b64_str, "media_type": "image"},
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["media_type"] == "image"
    assert "/api/v1/uploads/images/" in data["url"]
    assert "logo" in data["filename"]
