from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    ACTIVE_MODEL: str = "llama3.2:3b"
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

Path(settings.CHROMA_DB_PATH).mkdir(parents=True, exist_ok=True)
Path(settings.DOCS_PATH).mkdir(parents=True, exist_ok=True)

# Resolve to absolute paths relative to project root
BASE_DIR = Path(__file__).resolve().parent.parent
settings.CHROMA_DB_PATH = str((BASE_DIR / "data" / "chroma").resolve())
settings.DOCS_PATH = str((BASE_DIR / "data" / "docs").resolve())
