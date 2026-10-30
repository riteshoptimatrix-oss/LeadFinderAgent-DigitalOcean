from datetime import datetime, timedelta
from typing import Any, Union
import uuid
import bcrypt

# Patch passlib compatibility for bcrypt >= 4.0.0
if not hasattr(bcrypt, "__about__"):
    class _About:
        __version__ = getattr(bcrypt, "__version__", "4.0.0")
    bcrypt.__about__ = _About()

_orig_hashpw = bcrypt.hashpw
def _safe_hashpw(password, salt):
    if isinstance(password, (bytes, bytearray)) and len(password) > 72:
        password = password[:72]
    return _orig_hashpw(password, salt)
bcrypt.hashpw = _safe_hashpw

from jose import jwt
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not plain_password or not hashed_password:
        return False
    return pwd_context.verify(plain_password[:72], hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password[:72])

def create_access_token(subject: Union[str, Any], expires_delta: timedelta = None, additional_claims: dict = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
        "iat": datetime.utcnow(),
        "jti": str(uuid.uuid4()),
    }
    if additional_claims:
        to_encode.update(additional_claims)
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt
def create_refresh_token(subject: Union[str, Any], expires_delta: timedelta = None, additional_claims: dict = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "type": "refresh",
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
        "iat": datetime.utcnow(),
        "jti": str(uuid.uuid4()),
    }
    if additional_claims:
        to_encode.update(additional_claims)
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt
