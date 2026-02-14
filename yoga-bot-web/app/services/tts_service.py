import base64
import struct
from typing import Literal

import httpx
from app.config import get_settings

LanguageCode = Literal["eng", "hin"]


def _float32_to_wav_bytes(waveform: list[float], sample_rate: int = 16000) -> bytes:
    """Convert float32 [-1,1] waveform to WAV bytes (16-bit PCM)."""
    samples = []
    for s in waveform:
        s = max(-1.0, min(1.0, s))
        samples.append(int(s * 32767))
    pcm = struct.pack(f"<{len(samples)}h", *samples)
    # WAV header
    data_len = len(pcm)
    header = (
        b"RIFF"
        + (36 + data_len).to_bytes(4, "little")
        + b"WAVE"
        + b"fmt "
        + (16).to_bytes(4, "little")
        + (1).to_bytes(2, "little")  # PCM
        + (1).to_bytes(2, "little")  # mono
        + (sample_rate).to_bytes(4, "little")
        + (sample_rate * 2).to_bytes(4, "little")
        + (2).to_bytes(2, "little")
        + (16).to_bytes(2, "little")
        + b"data"
        + (data_len).to_bytes(4, "little")
    )
    return header + pcm


async def get_tts_base64(text: str, language: LanguageCode) -> str | None:
    """Call TTS service and return base64-encoded WAV, or None on failure."""
    settings = get_settings()
    lang_config = {
        "eng": (settings.ENG_TTS_PORT, settings.ENG_TTS_ENDPOINT),
        "hin": (settings.HIN_TTS_PORT, settings.HIN_TTS_ENDPOINT),
    }
    port, path = lang_config.get(language, lang_config["eng"])
    url = f"http://{settings.TTS_BASE_ENDPOINT}:{port}{path}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(url, json=text)
            r.raise_for_status()
            waveform = r.json()
            if not isinstance(waveform, list):
                return None
            wav_bytes = _float32_to_wav_bytes(waveform, 16000)
            return base64.b64encode(wav_bytes).decode("utf-8")
    except Exception:
        return None
