import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

# ── Database location ──────────────────────────────────────
# In local desktop mode (CHEFOS_LOCAL=1) we ALWAYS use SQLite and ignore any
# leftover DATABASE_URL from a dev .env file. Otherwise:
#   1. DATABASE_URL  → explicit cloud Postgres, if set
#   2. CHEFOS_DB_PATH → absolute SQLite path provided by the desktop shell
#                       (Tauri points this at AppData/Roaming/ChefOS/chefos.db)
#   3. local chefos.db next to the backend (developer fallback)
LOCAL = os.environ.get("CHEFOS_LOCAL") == "1"
DATABASE_URL = None if LOCAL else os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    db_path = os.environ.get("CHEFOS_DB_PATH")
    if not db_path:
        db_path = str(Path(__file__).parent / "chefos.db")
    # Make sure the parent folder exists (AppData path may be brand new)
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    DATABASE_URL = f"sqlite:///{db_path}"

# SQLite needs check_same_thread off because uvicorn serves on multiple threads
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
