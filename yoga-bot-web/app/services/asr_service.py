"""
ASR (speech-to-text) via Whisper (English) and Conformer (Hindi).
Matches Node.js index.js transcribeWithWhisper behavior.
"""
import uuid
from pathlib import Path
from typing import Literal

import httpx

from app.config import get_settings

LanguageCode = Literal["eng", "hin"]


async def transcribe(wav_path: str, language: LanguageCode) -> str:
    """
    Transcribe WAV file to text.
    - English: POST raw WAV bytes (application/octet-stream), response is plain text.
    - Hindi: POST multipart file with correlation-id header, response JSON with transcript/text/transcription.
    """
    settings = get_settings()
    path = Path(wav_path)
    if not path.exists():
        raise FileNotFoundError(wav_path)

    wav_bytes = path.read_bytes()

    if language == "hin":
        url = f"http://{settings.TTS_BASE_ENDPOINT}:{settings.HIN_WHISPER_PORT}{settings.HIN_WHISPER_ENDPOINT}"
        headers = {"correlation-id": str(uuid.uuid4())}
        files = {"file": ("audio.wav", wav_bytes, "audio/wav")}
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(url, files=files, headers=headers)
            r.raise_for_status()
            data = r.json()
            return (
                data.get("transcript")
                or data.get("text")
                or data.get("transcription")
                or ""
            ).strip()
    else:
        url = f"http://{settings.TTS_BASE_ENDPOINT}:{settings.ENG_WHISPER_PORT}{settings.ENG_WHISPER_ENDPOINT}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                url,
                content=wav_bytes,
                headers={"Content-Type": "application/octet-stream"},
            )
            r.raise_for_status()
            return r.text.strip()
