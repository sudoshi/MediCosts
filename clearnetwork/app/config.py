from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database — reads same .env as MediCosts Express app
    pg_host: str = "localhost"
    pg_port: int = 5432
    pg_user: str = "postgres"
    pg_password: str = ""
    pg_database: str = "medicosts"

    # App
    app_port: int = 8000
    debug: bool = False

    # Schema
    db_schema: str = "clearnetwork"

    model_config = {
        "env_file": str(Path(__file__).resolve().parents[2] / ".env"),
        "env_prefix": "",
        "extra": "ignore",
        "alias_generator": lambda field_name: {
            "pg_host": "PGHOST",
            "pg_port": "PGPORT",
            "pg_user": "PGUSER",
            "pg_password": "PGPASSWORD",
            "pg_database": "PGDATABASE",
        }.get(field_name, field_name.upper()),
        "populate_by_name": True,
    }

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.pg_user}:{self.pg_password}"
            f"@{self.pg_host}:{self.pg_port}/{self.pg_database}"
        )


settings = Settings()
