import pytest


class TestAuthLogin:
    async def test_login_success(self, client, db_session):
        resp = await client.post("/api/v1/auth/login", json={
            "username": "admin", "password": "linuxlab",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    async def test_login_invalid_password(self, client, db_session):
        resp = await client.post("/api/v1/auth/login", json={
            "username": "admin", "password": "wrongpass",
        })
        assert resp.status_code == 401
        assert "inválidas" in resp.json()["detail"]

    async def test_login_nonexistent_user(self, client, db_session):
        resp = await client.post("/api/v1/auth/login", json={
            "username": "nobody", "password": "linuxlab",
        })
        assert resp.status_code == 401

    async def test_login_missing_fields(self, client, db_session):
        resp = await client.post("/api/v1/auth/login", json={
            "username": "admin",
        })
        assert resp.status_code == 422

    async def test_login_empty_body(self, client, db_session):
        resp = await client.post("/api/v1/auth/login", json={})
        assert resp.status_code == 422


class TestRateLimit:
    async def test_rate_limit_exceeded(self, client, db_session):
        from app.core.rate_limiter import login_limiter
        await login_limiter.reset("127.0.0.1")
        for _ in range(5):
            resp = await client.post("/api/v1/auth/login", json={
                "username": "admin", "password": "wrong",
            })
            assert resp.status_code == 401

        resp = await client.post("/api/v1/auth/login", json={
            "username": "admin", "password": "wrong",
        })
        assert resp.status_code == 429
        await login_limiter.reset("127.0.0.1")

    async def test_rate_limit_reset_on_success(self, client, db_session):
        from app.core.rate_limiter import login_limiter
        await login_limiter.reset("127.0.0.1")
        for _ in range(4):
            await client.post("/api/v1/auth/login", json={
                "username": "admin", "password": "wrong",
            })

        resp = await client.post("/api/v1/auth/login", json={
            "username": "admin", "password": "linuxlab",
        })
        assert resp.status_code == 200

        resp = await client.post("/api/v1/auth/login", json={
            "username": "admin", "password": "wrong",
        })
        assert resp.status_code == 401
        await login_limiter.reset("127.0.0.1")


class TestAuthRegister:
    async def test_register_success(self, admin_client):
        resp = await admin_client.post("/api/v1/auth/register", json={
            "username": "newuser",
            "password": "testpass123",
            "full_name": "New User",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["username"] == "newuser"

    async def test_register_duplicate_username(self, admin_client):
        resp = await admin_client.post("/api/v1/auth/register", json={
            "username": "admin",
            "password": "testpass123",
            "full_name": "Duplicate",
        })
        assert resp.status_code == 409

    async def test_register_short_password(self, admin_client):
        resp = await admin_client.post("/api/v1/auth/register", json={
            "username": "user2",
            "password": "short12",
            "full_name": "User 2",
        })
        assert resp.status_code == 422

    async def test_register_unauthorized(self, client):
        resp = await client.post("/api/v1/auth/register", json={
            "username": "test", "password": "testpass123", "full_name": "Test",
        })
        assert resp.status_code == 401


class TestChangePassword:
    async def test_change_password_success(self, auth_client):
        resp = await auth_client.post("/api/v1/auth/change-password", json={
            "current_password": "password123",
            "new_password": "newpass12345",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data

    async def test_change_password_wrong_current(self, auth_client):
        resp = await auth_client.post("/api/v1/auth/change-password", json={
            "current_password": "wrongpass",
            "new_password": "newpass12345",
        })
        assert resp.status_code == 401

    async def test_change_password_short_new(self, auth_client):
        resp = await auth_client.post("/api/v1/auth/change-password", json={
            "current_password": "password123",
            "new_password": "short12",
        })
        assert resp.status_code == 422

    async def test_change_password_unauthorized(self, client):
        resp = await client.post("/api/v1/auth/change-password", json={
            "current_password": "x",
            "new_password": "y" * 8,
        })
        assert resp.status_code == 401


class TestTokenRefresh:
    async def test_refresh_success(self, client, db_session):
        from app.core.rate_limiter import login_limiter
        await login_limiter.reset("127.0.0.1")

        login_resp = await client.post("/api/v1/auth/login", json={
            "username": "admin", "password": "linuxlab",
        })
        refresh_token = login_resp.json()["refresh_token"]

        resp = await client.post("/api/v1/auth/refresh", json={
            "refresh_token": refresh_token,
        })
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    async def test_refresh_invalid_token(self, client):
        resp = await client.post("/api/v1/auth/refresh", json={
            "refresh_token": "invalid.jwt.token",
        })
        assert resp.status_code == 401
