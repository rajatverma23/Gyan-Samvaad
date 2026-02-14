import httpx
from fastapi import APIRouter, HTTPException

from app.schemas import (
    ChatRequest,
    ChatResponse,
    HistoryResponse,
    HistoryEntry,
    SessionInfo,
    LanguageMenu,
    LanguageCode,
)
from app.services.chat_service import chat_service, get_language_menu_message

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    client_id = req.client_id.strip()
    if not client_id:
        raise HTTPException(400, "client_id is required")

    # First message or body can set language
    lang_code = (req.message.strip().lower() or (req.language or "").lower())
    if lang_code in ("eng", "hin") and not chat_service.has_language(client_id):
        chat_service.set_language(client_id, lang_code)
        return ChatResponse(
            text="✅ Language set. You can start chatting now!" if lang_code == "eng"
            else "✅ आपकी भाषा हिंदी सेट कर दी गई है। अब आप चैट शुरू कर सकते हैं!",
            products=None,
        )

    if not chat_service.has_language(client_id):
        msg, codes = get_language_menu_message()
        raise HTTPException(400, detail={"message": msg, "codes": codes})

    lang = chat_service.get_language(client_id)
    if not lang:
        raise HTTPException(400, "Language not set")

    # Menu commands
    cmd = req.message.strip().lower()
    menu = chat_service.get_menu_options(lang)

    if cmd in ("1", menu["startNewSession"].lower()):
        chat_service.start_new_session(client_id)
        msg, codes = get_language_menu_message()
        return ChatResponse(text=msg, products=None)

    if cmd in ("m", menu["mainMenu"].lower()):
        return ChatResponse(text=menu["options"], products=None)

    if cmd in ("2", menu["history"].lower()):
        history = chat_service.get_history(client_id)
        if not history:
            return ChatResponse(text=menu["noHistory"], products=None)
        lines = [menu["historyTitle"]]
        for h in history:
            lines.append(f"\n{menu['userPrefix']} {h['user']}\n{menu['botName']} {h['bot']}\n")
        return ChatResponse(text="".join(lines)[:4000], products=None)

    if cmd in ("3", menu["changeLanguage"].lower()):
        chat_service.start_new_session(client_id)
        msg, codes = get_language_menu_message()
        return ChatResponse(text=msg, products=None)

    if not req.message.strip():
        return ChatResponse(text=menu["options"], products=None)

    try:
        result = await chat_service.handle_chat(req.message, client_id, lang)
    except httpx.ConnectError:
        return ChatResponse(
            text="⚠️ Cannot reach the YogaBot backend (connection refused). "
            "Make sure the RAG service is running and API_BASE_URL is correct (e.g. http://localhost:8899).",
            products=None,
        )
    except httpx.HTTPError as e:
        return ChatResponse(
            text=f"⚠️ Backend error: {e!s}",
            products=None,
        )

    return ChatResponse(
        text=result["text"],
        products=result.get("products"),
        audio_base64=result.get("audio_base64"),
    )


@router.get("/session/{client_id}", response_model=SessionInfo)
async def get_session(client_id: str):
    return SessionInfo(
        client_id=client_id,
        session_id=chat_service.get_session_id(client_id),
        language=chat_service.get_language(client_id),
        has_language=chat_service.has_language(client_id),
    )


@router.get("/history/{client_id}", response_model=HistoryResponse)
async def get_history(client_id: str):
    history = chat_service.get_history(client_id)
    return HistoryResponse(
        history=[HistoryEntry(user=h["user"], bot=h["bot"]) for h in history]
    )


@router.get("/menu", response_model=LanguageMenu)
async def language_menu():
    msg, codes = get_language_menu_message()
    return LanguageMenu(message=msg, codes=codes)
