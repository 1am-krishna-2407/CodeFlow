import uuid
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.config import settings
from app.db.models import JobStatus

Language = Literal["python", "java", "cpp"]


def _check_payload_text(value: str, field: str, max_bytes: int) -> str:
    # The worker hands code to the sandbox through an environment variable, which can't hold NUL bytes
    # and is capped by the kernel per string, so limits are enforced on encoded bytes, not characters.
    if "\x00" in value:
        raise ValueError(f"{field} must not contain NUL characters")
    if len(value.encode("utf-8")) > max_bytes:
        raise ValueError(f"{field} exceeds {max_bytes} bytes")
    return value


class JobCreatePayload(BaseModel):
    project_id: Optional[uuid.UUID] = None
    language: Language
    source_code: str = Field(min_length=1)
    stdin: Optional[str] = None

    @field_validator("project_id", mode="before")
    @classmethod
    def _blank_project_is_none(cls, v):
        return None if v == "" else v

    @field_validator("source_code")
    @classmethod
    def _check_source(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("source_code must not be blank")
        return _check_payload_text(v, "source_code", settings.MAX_SOURCE_BYTES)

    @field_validator("stdin")
    @classmethod
    def _check_stdin(cls, v: Optional[str]) -> Optional[str]:
        return None if v is None else _check_payload_text(v, "stdin", settings.MAX_STDIN_BYTES)


class JobCreatedOut(BaseModel):
    job_id: uuid.UUID
    status: JobStatus


class JobResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    stdout: Optional[str] = None
    stderr: Optional[str] = None
    exit_code: Optional[int] = None
    execution_time: Optional[float] = None  # seconds the program itself ran
    compile_time: Optional[float] = None  # seconds compiling; null for interpreted languages


class JobSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: Optional[uuid.UUID] = None
    language: str
    status: JobStatus
    created_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class JobDetailOut(JobSummaryOut):
    source_code: str
    stdin: Optional[str] = None
    result: Optional[JobResultOut] = None


class JobPageOut(BaseModel):
    items: List[JobSummaryOut]
    total: int
    skip: int
    limit: int


class JobStatsOut(BaseModel):
    total: int
    success: int
    failed: int
    queued: int
    running: int
    timeout: int
