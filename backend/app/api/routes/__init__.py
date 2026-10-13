from fastapi import APIRouter

from app.api.routes import auth, users, projects, jobs, dashboard

router = APIRouter()

router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(users.router, prefix="/users", tags=["users"])
router.include_router(projects.router, prefix="/projects", tags=["projects"])
router.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
