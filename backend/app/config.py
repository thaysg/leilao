from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database (PostgreSQL). "postgres://" and "postgresql://" URLs are accepted.
    database_url: str = "postgresql+psycopg://leilao:leilao@localhost:5432/leilao"

    # JWT signing key and the HMAC key used for the tamper-evident bid history.
    # BOTH must be set to long random values in production.
    secret_key: str = "dev-secret-change-me-dev-secret-change-me"
    audit_secret: str = "dev-audit-secret-change-me-dev-audit-secret"
    jwt_expire_minutes: int = 60 * 24 * 7

    # Anti-sniping: a bid accepted within the last `window` seconds moves the end to now + `extension`.
    anti_snipe_window_seconds: int = 120
    anti_snipe_extension_seconds: int = 120

    seed_on_start: bool = True      # create demo data when the database is empty
    run_finalizer: bool = True      # background loop that settles ended lots
    frontend_dist: str = ""         # path of the built React app (served by the API)
    cors_origins: str = "http://localhost:5173"

    external_timeout_seconds: float = 6.0
    external_cache_ttl_seconds: int = 600


settings = Settings()
