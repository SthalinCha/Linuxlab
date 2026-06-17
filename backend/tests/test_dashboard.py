import pytest


class TestDashboard:
    async def test_dashboard_stats(self, auth_client):
        resp = await auth_client.get("/api/v1/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert "hostname" in data
        assert "health_score" in data
        assert "alerts_count" in data

    async def test_dashboard_unauthorized(self, client):
        resp = await client.get("/api/v1/dashboard")
        assert resp.status_code == 401

    async def test_dashboard_history(self, auth_client):
        resp = await auth_client.get("/api/v1/dashboard/history")
        assert resp.status_code == 200
        data = resp.json()
        assert "cpu_history" in data
        assert "ram_history" in data

    async def test_dashboard_alerts(self, auth_client):
        resp = await auth_client.get("/api/v1/dashboard/alerts")
        assert resp.status_code == 200
        data = resp.json()
        assert "alerts" in data

    async def test_dashboard_top_consumers(self, auth_client):
        resp = await auth_client.get("/api/v1/dashboard/top-consumers")
        assert resp.status_code == 200
        data = resp.json()
        assert "top_cpu" in data
        assert "top_ram" in data

    async def test_dashboard_recent_activity(self, auth_client):
        resp = await auth_client.get("/api/v1/dashboard/recent-activity")
        assert resp.status_code == 200
        data = resp.json()
        assert "activity" in data

    async def test_dashboard_capacity(self, auth_client):
        resp = await auth_client.get("/api/v1/dashboard/capacity")
        assert resp.status_code == 200
        data = resp.json()
        assert "free_vcpus" in data
        assert "free_ram_gb" in data
        assert "free_disk_gb" in data
        assert "estimated_vms" in data


class TestHealth:
    async def test_health_endpoint(self, client):
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["database"] == "ok"
        assert "libvirt" in data
