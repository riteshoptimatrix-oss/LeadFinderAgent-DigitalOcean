from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


class SocialProfile(BaseModel):
    user_id: Optional[str] = None
    platform: str
    url: str
    handle: Optional[str] = None
    source_page: Optional[str] = None


class SocialMediaIssue(BaseModel):
    user_id: Optional[str] = None
    issue_type: str
    platform: Optional[str] = None
    description: str
    severity: str  # 'Critical', 'High', 'Medium', 'Low'
    affected_url: Optional[str] = None


class SocialMediaScorecard(BaseModel):
    user_id: Optional[str] = None
    overall_social_score: int = Field(ge=0, le=100, default=0)
    presence_score: int = Field(ge=0, le=100, default=0)
    linkedin_score: int = Field(ge=0, le=100, default=0)
    facebook_score: int = Field(ge=0, le=100, default=0)
    instagram_score: int = Field(ge=0, le=100, default=0)
    twitter_score: int = Field(ge=0, le=100, default=0)
    youtube_score: int = Field(ge=0, le=100, default=0)
    others_score: int = Field(ge=0, le=100, default=0)


class SocialMediaAnalysisResultBase(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    website_url: str
    scorecard: SocialMediaScorecard = Field(default_factory=SocialMediaScorecard)
    profiles: List[SocialProfile] = Field(default_factory=list)
    issues: List[SocialMediaIssue] = Field(default_factory=list)
    suggestions: List[str] = Field(default_factory=list)


class SocialMediaAnalysisResultCreate(SocialMediaAnalysisResultBase):
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SocialMediaAnalysisResultInDB(SocialMediaAnalysisResultCreate):
    id: str = Field(alias="_id")


class SocialMediaAnalysisResultResponse(SocialMediaAnalysisResultInDB):
    class Config:
        populate_by_name = True
