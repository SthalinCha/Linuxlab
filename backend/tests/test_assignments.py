import pytest

from app.models.virtual_machine import VirtualMachine
from app.models.student import Student
from app.models.vm_assignment import VMAssignment
from app.models.period import Period
from datetime import datetime, timezone


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
async def closed_period(db_session):
    now = datetime.now(timezone.utc)
    p = Period(
        code="P98",
        name="Closed-Period",
        start_date=datetime(2024, 1, 1),
        end_date=datetime(2024, 12, 31),
        is_active=False,
        closed_at=now,
    )
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return p


@pytest.fixture
async def past_period(db_session):
    p = Period(
        code="P97",
        name="Past-Period",
        start_date=datetime(2020, 1, 1),
        end_date=datetime(2020, 12, 31),
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
async def crashed_vm(db_session):
    vm = VirtualMachine(
        name=f"crashed-vm-{id(db_session)}",
        vcpus=1, ram_mb=1024, disk_gb=10,
        mac_address=f"52:54:00:cb:bb:{id(db_session) % 256:02x}",
        current_state="crashed",
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


@pytest.fixture
async def second_student(db_session):
    s = Student(
        full_name="Second Student",
        email=f"second-{id(db_session)}@test.edu",
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

    async def test_create_assignment_duplicate_vm(self, auth_client, sample_vm, sample_student, second_student, sample_period):
        resp = await auth_client.post("/api/v1/assignments", json={
            "student_id": sample_student.id,
            "vm_id": sample_vm.id,
            "period_id": sample_period.id,
        })
        assert resp.status_code == 201

        resp = await auth_client.post("/api/v1/assignments", json={
            "student_id": second_student.id,
            "vm_id": sample_vm.id,
            "period_id": sample_period.id,
        })
        assert resp.status_code == 409

    async def test_create_assignment_with_vm_id_zero(self, auth_client, sample_student, sample_period):
        resp = await auth_client.post("/api/v1/assignments", json={
            "student_id": sample_student.id,
            "vm_id": 0,
            "period_id": sample_period.id,
        })
        assert resp.status_code == 422

    async def test_create_assignment_with_negative_vm_id(self, auth_client, sample_student, sample_period):
        resp = await auth_client.post("/api/v1/assignments", json={
            "student_id": sample_student.id,
            "vm_id": -1,
            "period_id": sample_period.id,
        })
        assert resp.status_code == 422

    async def test_cannot_assign_crashed_vm(self, auth_client, crashed_vm, sample_student, sample_period):
        resp = await auth_client.post("/api/v1/assignments", json={
            "student_id": sample_student.id,
            "vm_id": crashed_vm.id,
            "period_id": sample_period.id,
        })
        assert resp.status_code == 422

    async def test_cannot_assign_closed_period(self, auth_client, sample_vm, sample_student, closed_period):
        resp = await auth_client.post("/api/v1/assignments", json={
            "student_id": sample_student.id,
            "vm_id": sample_vm.id,
            "period_id": closed_period.id,
        })
        assert resp.status_code == 422

    async def test_cannot_assign_past_period(self, auth_client, sample_vm, sample_student, past_period):
        resp = await auth_client.post("/api/v1/assignments", json={
            "student_id": sample_student.id,
            "vm_id": sample_vm.id,
            "period_id": past_period.id,
        })
        assert resp.status_code == 422


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


class TestBulkRelease:
    async def test_bulk_release_empty_ids(self, auth_client):
        resp = await auth_client.post("/api/v1/assignments/bulk-release", json={"ids": []})
        assert resp.status_code == 422

    async def test_bulk_release_success(self, auth_client, sample_vm, sample_student, sample_period):
        a = await auth_client.post("/api/v1/assignments", json={
            "student_id": sample_student.id, "vm_id": sample_vm.id, "period_id": sample_period.id,
        })
        a_id = a.json()["id"]
        resp = await auth_client.post("/api/v1/assignments/bulk-release", json={"ids": [a_id]})
        assert resp.status_code == 200
        data = resp.json()
        assert data["released"] == 1


class TestBatchCreate:
    async def test_batch_create_partial_failure(self, auth_client, sample_vm, sample_student, sample_period):
        resp = await auth_client.post("/api/v1/assignments/batch", json={
            "assignments": [
                {"vm_id": sample_vm.id, "student_id": sample_student.id, "period_id": sample_period.id},
                {"vm_id": 99999, "student_id": sample_student.id, "period_id": sample_period.id},
            ],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] == 1
        assert len(data["errors"]) == 1
        assert data["errors"][0]["vm_id"] == 99999

    async def test_batch_create_all_fail(self, auth_client, sample_period):
        resp = await auth_client.post("/api/v1/assignments/batch", json={
            "assignments": [
                {"vm_id": 99998, "student_id": 99998, "period_id": sample_period.id},
            ],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] == 0
        assert len(data["errors"]) == 1


class TestAutoAssign:
    async def test_auto_assign_preview(self, auth_client, sample_vm, sample_student, sample_period):
        resp = await auth_client.post("/api/v1/assignments/auto-assign", json={
            "period_id": sample_period.id,
            "preview": True,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["preview"] is True
        assert len(data["assignments"]) == 1
        assert data["assignments"][0]["student_id"] == sample_student.id
        assert data["assignments"][0]["vm_id"] == sample_vm.id
        assert data["available_vms"] == 1
        assert data["total_unassigned"] == 1

    async def test_auto_assign_execute(self, auth_client, sample_vm, sample_student, sample_period):
        resp = await auth_client.post("/api/v1/assignments/auto-assign", json={
            "period_id": sample_period.id,
            "preview": False,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] == 1
        assert data["unassigned_students"] == 0

    async def test_auto_assign_no_vms(self, auth_client, sample_student, sample_period):
        resp = await auth_client.post("/api/v1/assignments/auto-assign", json={
            "period_id": sample_period.id,
            "preview": True,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["assignments"]) == 0
        assert data["available_vms"] == 0
        assert data["total_unassigned"] == 1
