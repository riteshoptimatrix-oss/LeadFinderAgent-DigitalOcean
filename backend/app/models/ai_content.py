from typing import Optional
from pydantic import BaseModel, Field


class GenerateContentRequest(BaseModel):
    user_query: str = Field(
        ...,
        min_length=1,
        description="User topic, business idea, product description, or social media requirement"
    )


class GenerateContentResponse(BaseModel):
    success: bool
    response: Optional[str] = None
    error: Optional[str] = None


class ModifyContentRequest(BaseModel):
    response: str = Field(
        ...,
        min_length=1,
        description="The previously generated content to modify"
    )
    user_query: str = Field(
        ...,
        min_length=1,
        description="The requested changes or modification instructions"
    )


class ModifyContentResponse(BaseModel):
    success: bool
    response: Optional[str] = None
    error: Optional[str] = None


class SessionStartRequest(BaseModel):
    headless: Optional[bool] = False


class SessionStatusResponse(BaseModel):
    success: bool
    status: str
    is_logged_in: bool
    browser_running: bool
    message: Optional[str] = None
