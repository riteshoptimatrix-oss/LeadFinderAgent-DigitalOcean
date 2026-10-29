from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Dict, Any


class Settings(BaseSettings):
    PROJECT_NAME: str = "Lead Finder Agent"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # MongoDB
    MONGODB_URL: str = "mongodb://localhost:27017/lead_finder_agent"  # Default, to be overridden by env
    DATABASE_NAME: str = "lead_finder_agent"

    # Security
    SECRET_KEY: str = "super_secret_key_change_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15  # 15 minutes
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days
    JWT_ISSUER: str = "optimatrix_auth_server"
    JWT_AUDIENCE: str = "lead_finder_frontend"

    # SSL Configuration
    DISABLE_SSL_VERIFICATION: str = "false"

    # Admin Setup
    ADMIN_EMAIL: str | None = None
    ADMIN_PASSWORD: str | None = None
    ADMIN_NAME: str = "System Administrator"

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Request Limits
    MAX_REQUEST_SIZE_MB: int = 10

    # Environment
    ENVIRONMENT: str = "development"
    FRONTEND_BASE_URL: str = "http://localhost:3000"

    # ── SMTP (Email AI fallback / default outbound relay) ──────────────────
    SMTP_SERVER: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_ENCRYPTION: str = "TLS"   # TLS, SSL, or None
    SMTP_FROM_NAME: str = "Lead Finder Agent"

    model_config = SettingsConfigDict(env_file=".env", env_ignore_empty=True, extra="ignore")

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse comma-separated CORS origins into a list."""
        origins = [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
        for local_origin in ["http://localhost:3000", "http://127.0.0.1:3000"]:
            if local_origin not in origins:
                origins.append(local_origin)
        return origins

    @property
    def smtp_is_configured(self) -> bool:
        """True when usable SMTP credentials are present in the environment."""
        return bool(self.SMTP_SERVER and self.SMTP_USERNAME and self.SMTP_PASSWORD)

    def smtp_profile_dict(self, name: str = "Default SMTP (env)") -> Dict[str, Any]:
        """Build a default SMTP profile from environment configuration."""
        return {
            "name": name,
            "host": self.SMTP_SERVER,
            "port": self.SMTP_PORT,
            "username": self.SMTP_USERNAME,
            "password": self.SMTP_PASSWORD,
            "encryption": self.SMTP_ENCRYPTION if self.SMTP_ENCRYPTION in ("TLS", "SSL", "None") else "TLS",
            "timeout": 15,
            "daily_limit": 500,
            "hourly_limit": 50,
            "priority": 1,
            "is_active": True,
            "is_default": True,
        }


settings = Settings()
