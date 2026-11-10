from app.models import Reminder
from tests.conftest import DEVICE, body


def test_push_key(client):
    assert client.get("/push/key").json() == {"key": "pub-key"}


def test_save_get_and_delete(client, session):
    res = client.put(f"/reminders/{DEVICE}", json=body())
    assert res.status_code == 200
    assert res.json() == {
        "time": "09:00",
        "tz": "Asia/Kolkata",
        "bedtime": "22:30",
        "paused": False,
        "goal_met_day": None,
    }
    assert client.get(f"/reminders/{DEVICE}").json()["time"] == "09:00"
    assert client.delete(f"/reminders/{DEVICE}").status_code == 204
    assert client.get(f"/reminders/{DEVICE}").status_code == 404


def test_rejects_anything_beyond_what_reminders_need(client):
    res = client.put(f"/reminders/{DEVICE}", json=body(total_ml=1800))
    assert res.status_code == 422
    res = client.post(f"/reminders/{DEVICE}/today", json={"day": "2026-11-10", "goal_met": True, "ml": 2000})
    assert res.status_code == 422


def test_validates_time_zone_time_and_endpoint(client):
    assert client.put(f"/reminders/{DEVICE}", json=body(tz="Mars/Base")).status_code == 422
    assert client.put(f"/reminders/{DEVICE}", json=body(time="21:30")).status_code == 422
    sub = {
        "endpoint": "http://insecure.test/x",
        "keys": {"p256dh": "B" + "x" * 86, "auth": "authsecret123456"},
    }
    assert client.put(f"/reminders/{DEVICE}", json=body(subscription=sub)).status_code == 422
    assert client.put("/reminders/short", json=body()).status_code == 404


def test_goal_met_today_and_undo(client, engine):
    client.put(f"/reminders/{DEVICE}", json=body())
    assert (
        client.post(f"/reminders/{DEVICE}/today", json={"day": "2026-11-10", "goal_met": True}).status_code
        == 204
    )
    from sqlmodel import Session

    with Session(engine) as s:
        assert s.get(Reminder, DEVICE).done_day == "2026-11-10"
    client.post(f"/reminders/{DEVICE}/today", json={"day": "2026-11-10", "goal_met": False})
    with Session(engine) as s:
        assert s.get(Reminder, DEVICE).done_day is None


def test_feedback_pauses_and_saving_resumes(client):
    client.put(f"/reminders/{DEVICE}", json=body())
    for _ in range(7):
        client.post(f"/reminders/{DEVICE}/feedback", json={"action": "dismissed"})
    assert client.get(f"/reminders/{DEVICE}").json()["paused"] is True
    assert client.put(f"/reminders/{DEVICE}", json=body()).json()["paused"] is False


def test_send_due_needs_the_cron_token(client):
    assert client.post("/internal/send-due").status_code == 404
    assert client.post("/internal/send-due", headers={"X-Cron-Token": "wrong"}).status_code == 404
