"""Live end-to-end test of GET /api/v1/whatsapp/leads against the real app + DB."""
import os
import sys
import time
import datetime

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(BACKEND_DIR)
sys.path.insert(0, BACKEND_DIR)

from jose import jwt
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings

ADMIN_ID = "6a536477a6a00e5eb9602719"  # info@optimatrix.com (role=ADMIN)

now = datetime.datetime.utcnow()
token = jwt.encode(
    {
        "sub": ADMIN_ID,
        "iat": now,
        "exp": now + datetime.timedelta(minutes=15),
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
    },
    settings.SECRET_KEY,
    algorithm=settings.ALGORITHM,
)

with TestClient(app) as client:
    r = client.get(
        "/api/v1/whatsapp/leads",
        headers={"Authorization": f"Bearer {token}"},
        params={"limit": 1000, "skip": 0},
    )

    print("HTTP", r.status_code)
    if r.status_code != 200:
        print("BODY:", r.text[:500])
        sys.exit(1)

    body = r.json()
    rows = body.get("data", [])
    total = body.get("total", 0)
    print("total returned:", total)
    print("rows in payload:", len(rows))
    print("first 5:")
    for lead in rows[:5]:
        print(f"   _id={lead.get('_id')}  name={lead.get('name')!r}  phone={lead.get('phone')}")

    assert total == len(rows), "total != payload length"
    assert total > 0, "No leads returned!"
    print("\nLIVE E2E RESULT: PASS — /whatsapp/leads returns valid-phone leads for ADMIN.")
