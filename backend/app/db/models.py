import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum, Float, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import relationship

from app.db.base import Base


def _utcnow():
    return datetime.now(timezone.utc)


class RoleEnum(str, enum.Enum):
    user = "user"
    admin = "admin"


class JobStatus(str, enum.Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"
    timeout = "timeout"


TERMINAL_STATUSES = (JobStatus.completed, JobStatus.failed, JobStatus.timeout)


class User(Base):
    __tablename__ = "users"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    name = Column(String(128), nullable=False)
    email = Column(String(256), unique=True, nullable=False, index=True)
    password_hash = Column(String(256), nullable=False)
    role = Column(Enum(RoleEnum, name="roleenum"), nullable=False, default=RoleEnum.user)
    # Embedded in every token; bumping it revokes all of the user's outstanding tokens at once.
    token_version = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    projects = relationship("Project", back_populates="owner", cascade="all, delete-orphan", passive_deletes=True)
    jobs = relationship("Job", back_populates="user", cascade="all, delete-orphan", passive_deletes=True)


class Project(Base):
    __tablename__ = "projects"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(256), nullable=False)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    owner = relationship("User", back_populates="projects")
    # Deleting a project keeps its job history; the jobs just become unlinked.
    jobs = relationship("Job", back_populates="project", passive_deletes=True)


class Job(Base):
    __tablename__ = "jobs"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id = Column(Uuid, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id = Column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    language = Column(String(32), nullable=False)
    source_code = Column(Text, nullable=False)
    stdin = Column(Text, nullable=True)
    status = Column(Enum(JobStatus, name="jobstatus"), nullable=False, default=JobStatus.queued, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow, index=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    project = relationship("Project", back_populates="jobs")
    user = relationship("User", back_populates="jobs")
    result = relationship(
        "JobResult", back_populates="job", uselist=False, cascade="all, delete-orphan", passive_deletes=True
    )


class JobResult(Base):
    __tablename__ = "job_results"
    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    job_id = Column(Uuid, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, unique=True)
    stdout = Column(Text)
    stderr = Column(Text)
    exit_code = Column(Integer)
    execution_time = Column(Float)  # seconds the program itself ran
    compile_time = Column(Float, nullable=True)  # seconds compiling (Java/C++); null for Python

    job = relationship("Job", back_populates="result")
