from pydantic import BaseModel
from typing import Literal


LanguageCode = Literal["eng", "hin"]


class ChatRequest(BaseModel):
    message: str
    client_id: str
    language: LanguageCode | None = None


class ChatResponse(BaseModel):
    text: str
    products: list[dict] | None = None
    audio_base64: str | None = None
    user_message: str | None = None  # transcribed text for voice flow
    user_message: str | None = None  # transcribed text from voice (for chat display)


class SessionInfo(BaseModel):
    client_id: str
    session_id: str | None
    language: LanguageCode | None
    has_language: bool


class HistoryEntry(BaseModel):
    user: str
    bot: str


class HistoryResponse(BaseModel):
    history: list[HistoryEntry]


class LanguageMenu(BaseModel):
    message: str
    codes: list[str]
