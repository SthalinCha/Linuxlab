import pytest

from app.models.virtual_machine import VirtualMachine
from app.models.student import Student
from app.models.vm_assignment import VMAssignment
from app.models.period import Period
from datetime import datetime


@pytest.fixture
async def sample_period(db_session):
    p = Period(
        code="P99",
        name="2026-Test-Period",
        start_date=datetime(2026, 1, 1),
        end_date=datetime(2026, 12, 31),
    )
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return p


@pytest.fixture
async def sample_vm(db_session):
    vm = VirtualMachine(
        name=f"assign-vm-{id(db_session)}",
        vcpus=1, ram_mb=1024, disk_gb=10,
        mac_address=f"52:54:00:ab:aa:{id(db_session) % 256:02x}",
        current_state="shut off",
    )
    db_session.add(vm)
    await db_session.commit()
    await db_session.refresh(vm)
    return vm


@pytest.fixture
async def sample_student(db_session):
    s = Student(
        full_name="Assign Student",
        email=f"assign-{id(db_session)}@test.edu",
    )
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)
    return s


class TestListAssignments:
    async def test_list_assignments_paginated(self, auth_client):
        resp = await auth_client.get("/api/v1/assignments?limit=2")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert data["limit"] == 2
        assert isinstance(data["items"], list)

    async def test_list_assignments_unauthorized(self, client):
        resp = await client.get("/api/v1/assignments")
        assert resp.status_code == 401


class TestCreateAssignment:
    async def test_create_assignment_success(self, auth_client, sample_vm, sample_student, sample_period):
        resp = await auth_client.post("/api/v1/assignments", json={
            "student_id": sample_student.id,
            "vm_id": sample_vm.id,
            "period_id": sample_period.id,
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["student_id"] == sample_student.id
        assert data["vm_id"] == sample_vm.id

    async def test_create_assignment_duplicate_vm(self, auth_client, sample_vm, sample_student, sample_period):
        resp = await auth_client.post("/api/v1/assignments", json={
            "student_id": sample_student.id,
            "vm_id": sample_vm.id,
            "period_id": sample_period.id,
        })
        assert resp.status_code == 201

        resp = await auth_client.post("/api/v1/assignments", json={
            "student_id": sample_student.id,
            "vm_id": sample_vm.id,
            "period_id": sample_period.id,
        })
        assert resp.status_code == 409


class TestReleaseAssignment:
    async def test_release_assignment_success(self, auth_client, sample_vm, sample_student, sample_period):
        a_resp = await auth_client.post("/api/v1/assignments", json={
            "student_id": sample_student.id,
            "vm_id": sample_vm.id,
            "period_id": sample_period.id,
        })
        assignment_id = a_resp.json()["id"]

        resp = await auth_client.post(f"/api/v1/assignments/{assignment_id}/release")
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data

    async def test_release_assignment_not_found(self, auth_client):
        resp = await auth_client.post("/api/v1/assignments/99999/release")
        assert resp.status_code == 404
