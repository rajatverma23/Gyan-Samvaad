import uuid
from typing import Literal

import httpx
from app.config import get_settings
from app.utils.text_utils import extract_product_info, process_markdown

LanguageCode = Literal["eng", "hin"]

MENU_OPTIONS = {
    "eng": {
        "startNewSession": "Start New Session",
        "history": "View Chat History",
        "changeLanguage": "Change Language",
        "noHistory": "📭 No history available for this session.",
        "historyTitle": "🕘 *Chat History:*\n",
        "youSaid": "🗣 *You said:*",
        "botName": "*YogaBot:*",
        "userPrefix": "*You:*",
        "mainMenu": "📋 Main Menu",
        "options": "👉 *Options:*\n1. Start New Session\n2. View Chat History\n3. Change Language",
        "menuSuffix": "\n\n👉 Type *M* for Main Menu",
        "productClosing": "\nWould you like more information on these options or assistance with something else?\n\n👉 Type *M* for Main Menu",
    },
    "hin": {
        "startNewSession": "नया सत्र शुरू करें",
        "history": "चैट इतिहास देखें",
        "changeLanguage": "भाषा बदलें",
        "noHistory": "📭 इस सत्र के लिए कोई इतिहास उपलब्ध नहीं है।",
        "historyTitle": "🕘 *चैट इतिहास:*\n",
        "youSaid": "🗣 *आपने कहा:*",
        "botName": "*योगबॉट:*",
        "userPrefix": "*आप:*",
        "mainMenu": "📋 मुख्य मेनू",
        "options": "👉 *विकल्प:*\n1. नया सत्र शुरू करें\n2. चैट इतिहास देखें\n3. भाषा बदलें",
        "menuSuffix": "\n\n👉 मुख्य मेनू के लिए *M* टाइप करें",
        "productClosing": "\nक्या आप इन विकल्पों के बारे में अधिक जानकारी चाहते हैं या कुछ और सहायता चाहिए?\n\n👉 मुख्य मेनू के लिए *M* टाइप करें",
    },
}


class ChatService:
    def __init__(self):
        self._session_map: dict[str, str] = {}
        self._history_map: dict[str, list[dict]] = {}
        self._language_map: dict[str, str] = {}

    def _get_or_create_session(self, client_id: str) -> str:
        if client_id not in self._session_map:
            self._session_map[client_id] = str(uuid.uuid4())
        return self._session_map[client_id]

    def set_language(self, client_id: str, language: LanguageCode) -> None:
        self._language_map[client_id] = language
        self._get_or_create_session(client_id)

    def get_language(self, client_id: str) -> LanguageCode | None:
        return self._language_map.get(client_id)

    def has_language(self, client_id: str) -> bool:
        return client_id in self._language_map

    def start_new_session(self, client_id: str) -> None:
        self._session_map[client_id] = str(uuid.uuid4())
        self._history_map[client_id] = []
        self._language_map.pop(client_id, None)

    def get_history(self, client_id: str) -> list[dict]:
        return self._history_map.get(client_id, [])

    def get_session_id(self, client_id: str) -> str | None:
        return self._session_map.get(client_id)

    async def call_rag(self, message: str, session_id: str) -> str:
        settings = get_settings()
        url = f"{settings.API_BASE_URL.rstrip('/')}/v1/chat/message"
        params = {"message": message, "session_id": session_id}
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(
                url, params=params, headers={"Accept": "text/event-stream"}
            )
            response.raise_for_status()
            return response.text

    async def handle_chat(
        self, user_message: str, client_id: str, language: LanguageCode
    ) -> dict:
        """Returns { "text", "products"?, "audio_base64"? }."""
        session_id = self._get_or_create_session(client_id)
        raw = await self.call_rag(user_message, session_id)
        if not raw or not raw.strip():
            return {"text": "⚠️ No response from backend.", "products": None}

        products, remaining_text = extract_product_info(raw, language)
        menu = MENU_OPTIONS[language]

        if products:
            intro = remaining_text.split("\n\n")[0] + "\n\n" if remaining_text else ""
            closing = remaining_text[len(intro) :].strip() if remaining_text else ""
            if not closing:
                closing = menu["productClosing"]
            else:
                closing += menu["menuSuffix"]
            closing = process_markdown(closing)
            return {
                "text": intro + closing,
                "products": [
                    {
                        "name": p["name"],
                        "price": p["price"],
                        "link": p["link"],
                        "imageUrl": p["imageUrl"],
                    }
                    for p in products
                ],
            }

        formatted = process_markdown(raw)
        history = self._history_map.get(client_id, [])
        history.append({"user": user_message, "bot": raw})
        self._history_map[client_id] = history

        reply_text = formatted + menu["menuSuffix"]
        result = {"text": reply_text[:4000], "products": None}

        # Optional: add TTS in background or via separate endpoint
        try:
            from app.services.tts_service import get_tts_base64
            result["audio_base64"] = await get_tts_base64(raw, language)
        except Exception:
            pass
        return result

    def get_menu_options(self, language: LanguageCode) -> dict:
        return MENU_OPTIONS.get(language, MENU_OPTIONS["eng"])


def get_language_menu_message() -> tuple[str, list[str]]:
    msg = (
        "Namaste!\nनमस्ते!\n\n"
        "Please choose your preferred language:\n"
        "कृपया अपनी पसंदीदा भाषा चुनें:\n\n"
        "• eng – English\n• hin – हिंदी\n\n"
        "👉 Type the language code to continue (e.g., eng or hin)"
    )
    return msg, ["eng", "hin"]


chat_service = ChatService()
