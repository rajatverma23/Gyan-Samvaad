import tempfile
import subprocess
from pathlib import Path

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.services.chat_service import chat_service
from app.services.asr_service import transcribe as asr_transcribe
from app.schemas import ChatResponse, LanguageCode

router = APIRouter(prefix="/api", tags=["voice"])


@router.post("/voice", response_model=ChatResponse)
async def voice_message(
    audio: UploadFile = File(...),
    client_id: str = Form(...),
    language: LanguageCode = Form("eng"),
):
    if not client_id.strip():
        raise HTTPException(400, "client_id is required")
    client_id = client_id.strip()

    if not chat_service.has_language(client_id):
        from app.services.chat_service import get_language_menu_message
        msg, codes = get_language_menu_message()
        raise HTTPException(400, detail={"message": msg, "codes": codes})

    suffix = Path(audio.filename or "").suffix or ".ogg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name

    wav_path = tmp_path.replace(suffix, ".wav")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", tmp_path, "-ar", "16000", "-ac", "1", wav_path],
            check=True,
            capture_output=True,
        )
        lang = chat_service.get_language(client_id) or "eng"
        try:
            user_message = await asr_transcribe(wav_path, lang)
        except (httpx.ConnectError, httpx.HTTPError, FileNotFoundError) as e:
            return ChatResponse(
                text="⚠️ Speech recognition service unavailable. Check ASR endpoint (TTS_BASE_ENDPOINT + Whisper/Conformer ports).",
                products=None,
            )
    finally:
        Path(tmp_path).unlink(missing_ok=True)
        Path(wav_path).unlink(missing_ok=True)

    if not user_message or not user_message.strip():
        return ChatResponse(text="⚠️ Could not transcribe audio.", products=None)

    result = await chat_service.handle_chat(user_message, client_id, lang)
    # Prepend "You said: ..." for consistency
    menu = chat_service.get_menu_options(lang)
    prefix = f"{menu['youSaid']} {user_message}\n\n"
    return ChatResponse(
        text=prefix + result["text"],
        products=result.get("products"),
        audio_base64=result.get("audio_base64"),
        user_message=user_message,
    )
