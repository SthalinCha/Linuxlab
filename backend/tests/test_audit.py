import pytest


class TestAudit:
    async def test_audit_log_list(self, admin_client):
        resp = await admin_client.get("/api/v1/audit")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data

    async def test_audit_log_unauthorized(self, client):
        resp = await client.get("/api/v1/audit")
        assert resp.status_code == 401
