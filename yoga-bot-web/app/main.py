from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from app.config import get_settings
from app.routers import chat, voice

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(
    title="YogaBot Web",
    description="Web-based Yoga RAG chatbot (English & Hindi)",
    lifespan=lifespan,
)

app.include_router(chat.router)
app.include_router(voice.router)

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
async def index():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "YogaBot API", "docs": "/docs", "openapi": "/openapi.json"}


@app.get("/health")
async def health():
    return {"status": "ok"}
