from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.session import get_session
from app.models import User, Course, Period, Student
from app.core.rbac import profesor_only
from app.core.audit import log_event
from app.schemas import CourseCreate, CourseUpdate, CourseResponse, CourseWithCounts

router = APIRouter()


def _ip(request: Request) -> str:
    return request.client.host if request.client else ""


@router.get("")
async def list_courses(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
):
    query = select(Course).where(
        Course.deleted_at.is_(None),
        Course.profesor_id == user.id,
    ).order_by(Course.created_at.desc())

    result = await session.execute(query)
    courses = result.scalars().all()

    items = []
    for c in courses:
        period_count = await session.scalar(
            select(func.count(Period.id)).where(
                Period.course_id == c.id, Period.deleted_at.is_(None)
            )
        )
        student_count = await session.scalar(
            select(func.count(Student.id)).where(
                Student.course_id == c.id, Student.deleted_at.is_(None)
            )
        )
        items.append(CourseWithCounts(
            **{k: getattr(c, k) for k in ["id", "name", "code", "description", "profesor_id", "created_at", "updated_at"]},
            period_count=period_count or 0,
            student_count=student_count or 0,
        ))

    return {"items": items, "total": len(items)}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_course(
    body: CourseCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
):
    course = Course(
        name=body.name,
        code=body.code,
        description=body.description,
        profesor_id=user.id,
    )
    session.add(course)
    await session.commit()
    await session.refresh(course)

    await log_event(session, "course_create", user.username,
                    f"Creó curso {course.name}", "course", course.id,
                    ip_address=_ip(request))
    return course


@router.get("/{course_id}")
async def get_course(
    course_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
):
    course = await _get_course_or_404(session, course_id, user)
    return course


@router.put("/{course_id}")
async def update_course(
    course_id: int,
    body: CourseUpdate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
):
    course = await _get_course_or_404(session, course_id, user)
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(course, key, value)
    await session.commit()
    await session.refresh(course)
    await log_event(session, "course_update", user.username,
                    f"Actualizó curso {course.name}", "course", course.id,
                    ip_address=_ip(request))
    return course


@router.delete("/{course_id}")
async def delete_course(
    course_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(profesor_only),
):
    course = await _get_course_or_404(session, course_id, user)
    course.soft_delete()
    await session.commit()
    await log_event(session, "course_delete", user.username,
                    f"Eliminó curso {course.name}", "course", course.id,
                    ip_address=_ip(request))
    return {"message": "Curso eliminado"}


async def _get_course_or_404(session: AsyncSession, course_id: int, user: User) -> Course:
    course = await session.get(Course, course_id)
    if not course or course.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curso no encontrado")
    if user.role.name == "profesor" and course.profesor_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permiso para este curso")
    return course
