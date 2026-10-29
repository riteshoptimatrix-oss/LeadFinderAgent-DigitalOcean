from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, Field

class WorkerNodeBase(BaseModel):
    user_id: Optional[str] = None
    node_id: str
    status: str = "ONLINE"
    active_jobs: int = 0

class WorkerNodeCreate(WorkerNodeBase):
    started_at: datetime = Field(default_factory=datetime.utcnow)
    last_heartbeat: datetime = Field(default_factory=datetime.utcnow)

class WorkerNodeInDB(WorkerNodeCreate):
    id: str = Field(alias="_id")

class WorkerNodeResponse(WorkerNodeInDB):
    class Config:
        populate_by_name = True

class JobLogBase(BaseModel):
    user_id: Optional[str] = None
    job_type: str # 'EMAIL_QUEUE', 'WA_QUEUE', 'SEARCH_SCRAPER'
    target_id: Optional[str] = None # The _id of the email_log, wa_log, or search_job
    level: str = "INFO" # INFO, WARNING, ERROR, FATAL
    message: str
    details: Optional[Any] = None

class JobLogCreate(JobLogBase):
    created_at: datetime = Field(default_factory=datetime.utcnow)

class JobLogInDB(JobLogCreate):
    id: str = Field(alias="_id")

class JobLogResponse(JobLogInDB):
    class Config:
        populate_by_name = True
