from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    ACTIVE_MODEL: str = "qwen2.5-coder:1.5b"
    EMBED_MODEL: str = "nomic-embed-text"
    CHROMA_DB_PATH: str = "./data/chroma"
    DOCS_PATH: str = "./data/docs"
    ALLOW_WEB_SEARCH: bool = True
    
    # Network config
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    class Config:
        env_file = ".env"

settings = Settings()

# Ensure directories exist
Path(settings.CHROMA_DB_PATH).parent.mkdir(parents=True, exist_ok=True)
Path(settings.DOCS_PATH).parent.mkdir(parents=True, exist_ok=True)
