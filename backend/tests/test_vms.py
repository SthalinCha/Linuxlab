import pytest
from unittest.mock import patch

from app.models.virtual_machine import VirtualMachine


@pytest.fixture
async def sample_vm(db_session):
    vm = VirtualMachine(
        name=f"test-vm-{id(db_session)}",
        vcpus=1,
        ram_mb=2048,
        disk_gb=10,
        mac_address=f"52:54:00:ab:00:{id(db_session) % 256:02x}",
        current_state="shut off",
    )
    db_session.add(vm)
    await db_session.commit()
    await db_session.refresh(vm)
    return vm


class TestListVMs:
    async def test_list_vms_paginated(self, auth_client):
        resp = await auth_client.get("/api/v1/vms?limit=2")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert data["limit"] == 2
        assert data["offset"] == 0
        assert isinstance(data["items"], list)

    async def test_list_vms_offset(self, auth_client):
        resp = await auth_client.get("/api/v1/vms?limit=2&offset=0")
        first = resp.json()
        resp2 = await auth_client.get("/api/v1/vms?limit=2&offset=2")
        second = resp2.json()
        assert first["limit"] == 2
        assert second["offset"] == 2

    async def test_list_vms_unauthorized(self, client):
        resp = await client.get("/api/v1/vms")
        assert resp.status_code == 401

    async def test_list_vms_with_state_filter(self, auth_client):
        resp = await auth_client.get("/api/v1/vms?state=shut%20off")
        assert resp.status_code == 200


class TestGetVM:
    async def test_get_vm_not_found(self, auth_client):
        resp = await auth_client.get("/api/v1/vms/99999")
        assert resp.status_code == 404

    async def test_get_vm_success(self, auth_client, sample_vm):
        resp = await auth_client.get(f"/api/v1/vms/{sample_vm.id}")
        assert resp.status_code == 200
        assert resp.json()["name"] == sample_vm.name


class TestDeleteVM:
    async def test_delete_vm_success(self, auth_client, sample_vm):
        resp = await auth_client.delete(f"/api/v1/vms/{sample_vm.id}")
        assert resp.status_code == 200

        resp = await auth_client.get(f"/api/v1/vms/{sample_vm.id}")
        assert resp.status_code == 404

    async def test_delete_vm_not_found(self, auth_client):
        resp = await auth_client.delete("/api/v1/vms/99999")
        assert resp.status_code == 404


class TestVMActions:
    async def test_start_vm(self, auth_client, sample_vm):
        resp = await auth_client.post(f"/api/v1/vms/{sample_vm.id}/start")
        assert resp.status_code == 200

    async def test_shutdown_vm(self, auth_client, sample_vm):
        resp = await auth_client.post(f"/api/v1/vms/{sample_vm.id}/shutdown")
        assert resp.status_code == 200

    async def test_action_not_found(self, auth_client):
        resp = await auth_client.post("/api/v1/vms/99999/start")
        assert resp.status_code == 404


class TestBulkDelete:
    async def test_bulk_delete(self, auth_client, db_session):
        ids = []
        for i in range(3):
            vm = VirtualMachine(
                name=f"bulk-del-{i}",
                vcpus=1, ram_mb=1024, disk_gb=10,
                mac_address=f"52:54:00:ab:bd:{i:02x}",
                current_state="shut off",
            )
            db_session.add(vm)
            await db_session.flush()
            ids.append(vm.id)
        await db_session.commit()

        resp = await auth_client.post("/api/v1/vms/bulk-delete", json={"ids": ids})
        assert resp.status_code == 200
        results = resp.json()
        assert isinstance(results, list)
        assert len(results) == len(ids)

    async def test_bulk_delete_empty_ids(self, auth_client):
        resp = await auth_client.post("/api/v1/vms/bulk-delete", json={"ids": []})
        assert resp.status_code == 422


class TestBulkAction:
    async def test_bulk_action(self, auth_client, db_session):
        ids = []
        for i in range(2):
            vm = VirtualMachine(
                name=f"bulk-action-{i}",
                vcpus=1, ram_mb=1024, disk_gb=10,
                mac_address=f"52:54:00:ab:ba:{i:02x}",
                current_state="shut off",
            )
            db_session.add(vm)
            await db_session.flush()
            ids.append(vm.id)
        await db_session.commit()

        resp = await auth_client.post("/api/v1/vms/bulk-action", json={
            "ids": ids, "action": "start",
        })
        assert resp.status_code == 200
        results = resp.json()
        assert isinstance(results, list)
        assert len(results) == len(ids)


class TestCloneVM:
    async def test_clone_vm_success(self, auth_client, db_session):
        with patch("app.api.v1.vms.clone_service.clone_vm") as mock_clone:
            mock_clone.return_value = {"success": True, "name": "vhost-99", "uuid": "fake-uuid", "mac": "52:54:00:35:E0:63", "path": "/fake/path"}
            resp = await auth_client.post("/api/v1/vms/clone", json={"number": 99})
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "vhost-99"

    async def test_clone_vm_conflict(self, auth_client, db_session, sample_vm):
        with patch("app.api.v1.vms.clone_service.clone_vm") as mock_clone:
            mock_clone.return_value = {"success": True, "name": "test-vm-0", "uuid": "fake-uuid", "mac": "52:54:00:35:E0:00", "path": "/fake/path"}
            resp = await auth_client.post("/api/v1/vms/clone", json={"number": 0})
        assert resp.status_code == 200

    async def test_clone_vm_libvirt_error(self, auth_client):
        with patch("app.api.v1.vms.clone_service.clone_vm") as mock_clone:
            mock_clone.return_value = {"success": False, "error": "libvirt error simulado"}
            resp = await auth_client.post("/api/v1/vms/clone", json={"number": 50})
        assert resp.status_code == 500

    async def test_clone_vm_custom_resources(self, auth_client, db_session):
        with patch("app.api.v1.vms.clone_service.clone_vm") as mock_clone:
            mock_clone.return_value = {"success": True, "name": "vhost-77", "uuid": "fake-uuid", "mac": "52:54:00:35:E0:4D", "path": "/fake/path"}
            resp = await auth_client.post("/api/v1/vms/clone", json={
                "number": 77, "vcpus": 4, "ram_mb": 8192, "template_name": "custom-template",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "vhost-77"
        mock_clone.assert_called_once()
        _, kwargs = mock_clone.call_args
        assert kwargs["memory_mb"] == 8192
        assert kwargs["vcpus"] == 4


class TestCloneRange:
    async def test_clone_range_success(self, auth_client, db_session):
        with patch("app.api.v1.vms.clone_service.clone_vm") as mock_clone:
            mock_clone.return_value = {"success": True, "name": "vhost-10", "uuid": "fake", "mac": "52:54:00:35:E0:0A", "path": "/fake"}
            resp = await auth_client.post("/api/v1/vms/clone-range", json={
                "from_number": 10, "to_number": 11,
            })
        assert resp.status_code == 200
        results = resp.json()
        assert isinstance(results, list)
        assert len(results) == 2

    async def test_clone_range_invalid(self, auth_client):
        resp = await auth_client.post("/api/v1/vms/clone-range", json={
            "from_number": 20, "to_number": 10,
        })
        assert resp.status_code == 422

    async def test_clone_range_out_of_bounds(self, auth_client):
        resp = await auth_client.post("/api/v1/vms/clone-range", json={
            "from_number": 0, "to_number": 255,
        })
        assert resp.status_code == 422


class TestCreateLab:
    async def test_create_lab_success(self, auth_client, db_session):
        with patch("app.api.v1.vms.clone_service.clone_vm") as mock_clone:
            mock_clone.return_value = {"success": True, "name": "lab-vm", "uuid": "fake", "mac": "52:54:00:35:E0:01", "path": "/fake"}
            resp = await auth_client.post("/api/v1/vms/create-lab", json={
                "count": 2, "start_number": 1, "prefix": "lab-vm",
            })
        assert resp.status_code == 200
        results = resp.json()
        assert isinstance(results, list)
        assert len(results) == 2
        assert results[0]["status"] == "created"

    async def test_create_lab_invalid_count(self, auth_client):
        resp = await auth_client.post("/api/v1/vms/create-lab", json={
            "count": 0, "start_number": 1,
        })
        assert resp.status_code == 422

    async def test_create_lab_count_too_high(self, auth_client):
        resp = await auth_client.post("/api/v1/vms/create-lab", json={
            "count": 51, "start_number": 1,
        })
        assert resp.status_code == 422

    async def test_create_lab_invalid_start(self, auth_client):
        resp = await auth_client.post("/api/v1/vms/create-lab", json={
            "count": 1, "start_number": 0,
        })
        assert resp.status_code == 422


class TestRecreateVM:
    async def test_recreate_vm_success(self, auth_client, sample_vm):
        with patch("app.api.v1.vms.clone_service.recreate_vm") as mock_recreate:
            mock_recreate.return_value = {"success": True, "name": sample_vm.name, "path": "/fake/path"}
            resp = await auth_client.post(f"/api/v1/vms/{sample_vm.id}/recreate")
        assert resp.status_code == 200
        data = resp.json()
        assert "recreation_count" in data

    async def test_recreate_vm_not_found(self, auth_client):
        resp = await auth_client.post("/api/v1/vms/99999/recreate")
        assert resp.status_code == 404

    async def test_recreate_vm_libvirt_error(self, auth_client, sample_vm):
        with patch("app.api.v1.vms.clone_service.recreate_vm") as mock_recreate:
            mock_recreate.return_value = {"success": False, "error": "libvirt error simulado"}
            resp = await auth_client.post(f"/api/v1/vms/{sample_vm.id}/recreate")
        assert resp.status_code == 500


class TestRecreateRange:
    async def test_recreate_range_success(self, auth_client, db_session):
        vms = []
        for i in range(2):
            vm = VirtualMachine(
                name=f"recreate-range-{i}", vcpus=1, ram_mb=2048, disk_gb=10,
                mac_address=f"52:54:00:ab:rr:{i:02x}", current_state="shut off",
            )
            db_session.add(vm)
            await db_session.flush()
            vms.append(vm)
        await db_session.commit()

        with patch("app.api.v1.vms.clone_service.recreate_vm") as mock_recreate:
            mock_recreate.return_value = {"success": True, "name": "recreate-range-0", "path": "/fake"}
            resp = await auth_client.post("/api/v1/vms/recreate-range", json={
                "from_number": 1, "to_number": 2,
            })
        assert resp.status_code == 200
        results = resp.json()
        assert isinstance(results, list)

    async def test_recreate_range_invalid(self, auth_client):
        resp = await auth_client.post("/api/v1/vms/recreate-range", json={
            "from_number": 5, "to_number": 3,
        })
        assert resp.status_code == 422


class TestPortManagement:
    async def test_add_port_success(self, auth_client, sample_vm):
        resp = await auth_client.post(f"/api/v1/vms/{sample_vm.id}/ports", json={
            "service": "ssh", "port": 22,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "ports" in data
        assert len(data["ports"]) > 0
        assert data["ports"][-1]["service"] == "ssh"

    async def test_add_port_vm_not_found(self, auth_client):
        resp = await auth_client.post("/api/v1/vms/99999/ports", json={
            "service": "http", "port": 80,
        })
        assert resp.status_code == 404

    async def test_remove_port_success(self, auth_client, sample_vm):
        resp = await auth_client.post(f"/api/v1/vms/{sample_vm.id}/ports", json={
            "service": "https", "port": 443,
        })
        assert resp.status_code == 200
        data = resp.json()
        port_index = len(data["ports"]) - 1

        resp = await auth_client.delete(f"/api/v1/vms/{sample_vm.id}/ports/{port_index}")
        assert resp.status_code == 200

    async def test_remove_port_not_found(self, auth_client, sample_vm):
        resp = await auth_client.delete(f"/api/v1/vms/{sample_vm.id}/ports/999")
        assert resp.status_code == 404
