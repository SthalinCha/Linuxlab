import pytest
import io

from app.models.student import Student


@pytest.fixture
async def sample_student(db_session):
    from app.models import User
    from sqlalchemy import select
    r = await db_session.execute(select(User).where(User.username == "prof1"))
    prof1 = r.scalar_one_or_none()
    s = Student(
        full_name="Test Student",
        email=f"student-{id(db_session)}@test.edu",
        student_code=f"STU-{id(db_session) % 10000:04d}",
        created_by=prof1.id if prof1 else None,
    )
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)
    return s


class TestListStudents:
    async def test_list_students_paginated(self, auth_client):
        resp = await auth_client.get("/api/v1/students?limit=2")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert data["limit"] == 2
        assert isinstance(data["items"], list)

    async def test_list_students_search(self, auth_client):
        resp = await auth_client.get("/api/v1/students?search=Admin")
        assert resp.status_code == 200

    async def test_list_students_unauthorized(self, client):
        resp = await client.get("/api/v1/students")
        assert resp.status_code == 401


class TestCreateStudent:
    async def test_create_student_success(self, auth_client):
        resp = await auth_client.post("/api/v1/students", json={
            "full_name": "Test Student",
            "email": "test-create-student@test.edu",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["full_name"] == "Test Student"

    async def test_create_student_duplicate_email(self, auth_client):
        await auth_client.post("/api/v1/students", json={
            "full_name": "Original",
            "email": "dup-student@test.edu",
        })
        resp = await auth_client.post("/api/v1/students", json={
            "full_name": "Duplicate",
            "email": "dup-student@test.edu",
        })
        assert resp.status_code == 409

    async def test_create_student_missing_fields(self, auth_client):
        resp = await auth_client.post("/api/v1/students", json={
            "full_name": "Missing Email",
        })
        assert resp.status_code == 422


class TestUpdateStudent:
    async def test_update_student_success(self, auth_client, sample_student):
        resp = await auth_client.put(f"/api/v1/students/{sample_student.id}", json={
            "full_name": "Updated Name",
            "email": sample_student.email,
        })
        assert resp.status_code == 200
        assert resp.json()["full_name"] == "Updated Name"

    async def test_update_student_not_found(self, auth_client):
        resp = await auth_client.put("/api/v1/students/99999", json={
            "full_name": "No One",
            "email": "noone@test.edu",
        })
        assert resp.status_code == 404


class TestDeleteStudent:
    async def test_delete_student_success(self, auth_client, sample_student):
        resp = await auth_client.delete(f"/api/v1/students/{sample_student.id}")
        assert resp.status_code == 200

        resp = await auth_client.get(f"/api/v1/students/{sample_student.id}")
        assert resp.status_code == 404

    async def test_delete_student_not_found(self, auth_client):
        resp = await auth_client.delete("/api/v1/students/99999")
        assert resp.status_code == 404


class TestImportCSV:
    async def test_import_csv_success(self, auth_client):
        csv_content = "full_name,email\nJohn Doe,john-import@test.edu\nJane Doe,jane-import@test.edu\n"
        resp = await auth_client.post(
            "/api/v1/students/import-csv",
            files={"file": ("students.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] == 2

    async def test_import_csv_duplicate_email(self, auth_client, db_session):
        from app.models.student import Student
        s = Student(full_name="Existing", email="dup-csv@test.edu", student_code="DUP001")
        db_session.add(s)
        await db_session.commit()

        csv_content = "full_name,email\nDup,dup-csv@test.edu\n"
        resp = await auth_client.post(
            "/api/v1/students/import-csv",
            files={"file": ("students.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        )
        assert resp.status_code == 200
        assert resp.json()["created"] == 1

    async def test_import_csv_no_file(self, auth_client):
        resp = await auth_client.post("/api/v1/students/import-csv")
        assert resp.status_code == 422
