from fastapi.testclient import TestClient

from app import __version__
from app.main import create_app


def test_health_reports_ok_and_version() -> None:
    client = TestClient(create_app())
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "waterbuddy-api"
    assert body["version"] == __version__


def test_cors_allows_the_local_web_app() -> None:
    client = TestClient(create_app())
    res = client.get("/health", headers={"Origin": "http://localhost:5175"})
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5175"


def test_cors_rejects_unknown_origins() -> None:
    client = TestClient(create_app())
    res = client.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in res.headers
