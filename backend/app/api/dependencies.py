from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from pydantic import ValidationError
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from app.core.config import settings
from app.db.database import get_db
from app.models.user import UserInDB
from app.models.token import TokenPayload

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

async def get_current_user(
    db: AsyncIOMotorDatabase = Depends(get_db),
    token: str = Depends(oauth2_scheme)
) -> UserInDB:
    try:
        payload = jwt.decode(
            token, 
            settings.SECRET_KEY, 
            algorithms=[settings.ALGORITHM],
            audience=settings.JWT_AUDIENCE,
            issuer=settings.JWT_ISSUER
        )
        token_data = TokenPayload(**payload)
    except (JWTError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not ObjectId.is_valid(token_data.sub):
        raise HTTPException(status_code=401, detail="Invalid token subject")
        
    role = getattr(token_data, "role", "user") or "user"
    # Normalize to lowercase for collection lookup, uppercase for UserRole enum
    role_lower = role.lower()
    collection_name = "admins" if role_lower == "admin" else "users"
    
    user = await db[collection_name].find_one({"_id": ObjectId(token_data.sub)})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User or Admin not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if not user.get("is_active"):
        raise HTTPException(status_code=403, detail="Inactive account")
        
    # Default legacy users to user role, though JWT will enforce it
    if "role" not in user:
        user["role"] = role
        
    user["_id"] = str(user["_id"])
    
    # Normalize role to uppercase to match UserRole enum (ADMIN, USER, etc.)
    raw_role = user.get("role", role_lower) or role_lower
    user["role"] = raw_role.upper() if isinstance(raw_role, str) else raw_role
    
    from app.core.context import set_current_user_id
    set_current_user_id(user["_id"])
    
    if role_lower == "admin":
        if "hashed_password" not in user and "password_hash" in user:
            user["hashed_password"] = user["password_hash"]
        return UserInDB(**user)
    
    return UserInDB(**user)

async def get_tenant_db(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: UserInDB = Depends(get_current_user)
):
    """Returns a wrapped database instance that automatically isolates data by user_id."""
    from app.db.tenant import TenantDatabase
    return TenantDatabase(db, current_user.id)

class RequireRole:
    def __init__(self, allowed_roles: list[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: UserInDB = Depends(get_current_user)):
        # Compare case-insensitively (stored as ADMIN/USER enum, allowed_roles may be ['admin'])
        user_role = current_user.role.value.lower() if hasattr(current_user.role, 'value') else str(current_user.role).lower()
        allowed = [r.lower() for r in self.allowed_roles]
        if user_role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operation not permitted"
            )
        return current_user


async def get_current_superuser(
    current_user: UserInDB = Depends(get_current_user),
) -> UserInDB:
    """Dependency that requires the current user to be a superuser/admin."""
    if not current_user.is_superuser and current_user.role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superuser privileges required",
        )
    return current_user
