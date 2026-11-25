from pydantic import BaseModel
from typing import Optional

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    role: str = "user"

class TokenPayload(BaseModel):
    sub: Optional[str] = None
    role: str = "user"
    is_impersonated: Optional[bool] = False
    impersonated_by: Optional[str] = None
    admin_email: Optional[str] = None
