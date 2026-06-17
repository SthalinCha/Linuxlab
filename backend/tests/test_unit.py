import pytest


class TestRateLimiter:
    async def test_allow_first_request(self):
        from app.core.rate_limiter import RateLimiter
        limiter = RateLimiter(max_attempts=5, window_seconds=60)
        assert await limiter.check("1.2.3.4") is True

    async def test_block_after_max_attempts(self):
        from app.core.rate_limiter import RateLimiter
        limiter = RateLimiter(max_attempts=3, window_seconds=60)
        for _ in range(3):
            await limiter.check("5.6.7.8")
        assert await limiter.check("5.6.7.8") is False

    async def test_reset_clears_attempts(self):
        from app.core.rate_limiter import RateLimiter
        limiter = RateLimiter(max_attempts=3, window_seconds=60)
        for _ in range(3):
            await limiter.check("9.10.11.12")
        assert await limiter.check("9.10.11.12") is False

        await limiter.reset("9.10.11.12")
        assert await limiter.check("9.10.11.12") is True

    async def test_different_ips_independent(self):
        from app.core.rate_limiter import RateLimiter
        limiter = RateLimiter(max_attempts=2, window_seconds=60)
        await limiter.check("ip-a")
        await limiter.check("ip-a")
        assert await limiter.check("ip-a") is False
        assert await limiter.check("ip-b") is True


class TestSecurity:
    def test_hash_password_roundtrip(self):
        from app.core.security import hash_password, verify_password
        h = hash_password("test-password-123")
        assert verify_password("test-password-123", h) is True
        assert verify_password("wrong-password", h) is False

    def test_create_access_token(self):
        from app.core.security import create_access_token, decode_token
        token = create_access_token({"sub": "testuser"})
        payload = decode_token(token)
        assert payload["sub"] == "testuser"
        assert payload["type"] == "access"
        assert "exp" in payload

    def test_refresh_token_type(self):
        from app.core.security import create_refresh_token, decode_token
        token = create_refresh_token({"sub": "testuser"})
        payload = decode_token(token)
        assert payload["type"] == "refresh"

    def test_invalid_token_raises(self):
        from app.core.security import decode_token
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            decode_token("invalid.token.here")
        assert exc.value.status_code == 401


class TestValidators:
    def test_user_create_password_too_short(self):
        from pydantic import ValidationError
        from app.schemas.user import UserCreate
        with pytest.raises(ValidationError) as exc:
            UserCreate(username="test", password="short12",
                      full_name="Test", email="t@t.com", role_id=1)
        assert "8 caracteres" in str(exc.value)

    def test_user_create_password_ok(self):
        from app.schemas.user import UserCreate
        u = UserCreate(username="test", password="longenough123",
                      full_name="Test", email="t@t.com", role_id=1)
        assert u.password == "longenough123"

    def test_change_password_too_short(self):
        from pydantic import ValidationError
        from app.schemas.user import ChangePasswordRequest
        with pytest.raises(ValidationError) as exc:
            ChangePasswordRequest(current_password="old", new_password="short12")
        assert "8 caracteres" in str(exc.value)

    def test_change_password_ok(self):
        from app.schemas.user import ChangePasswordRequest
        r = ChangePasswordRequest(current_password="old", new_password="longenough123")
        assert r.new_password == "longenough123"

    def test_vm_schema_mac_validation(self):
        from pydantic import ValidationError
        from app.schemas.virtual_machine import VirtualMachineCreate
        with pytest.raises(ValidationError):
            VirtualMachineCreate(
                name="test", mac_address="invalid-mac",
                vcpus=1, ram_mb=1024, disk_gb=10,
            )

    def test_vm_schema_valid_mac(self):
        from app.schemas.virtual_machine import VirtualMachineCreate
        u = VirtualMachineCreate(
            name="test", mac_address="52:54:00:ab:cd:ef",
            vcpus=1, ram_mb=1024, disk_gb=10,
        )
        assert u.mac_address == "52:54:00:ab:cd:ef"
