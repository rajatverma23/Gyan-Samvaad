from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Server
    PORT: int = 8000
    API_BASE_URL: str = "http://localhost:8899"
    TTS_BASE_ENDPOINT: str = "localhost"

    # Audio
    AUDIO_SAMPLE_RATE: int = 16000
    AUDIO_CHANNELS: int = 1
    AUDIO_DIR: str = "./audio"
    TEMP_DIR: str = "./temp"

    # English ASR/TTS
    ENG_WHISPER_ENDPOINT: str = "/predictions/whisper_asr"
    ENG_WHISPER_PORT: int = 8083
    ENG_TTS_ENDPOINT: str = "/predictions/ms_speecht5_tts_en"
    ENG_TTS_PORT: int = 6003

    # Hindi ASR/TTS
    HIN_WHISPER_ENDPOINT: str = "/predictions/conformer_asr"
    HIN_WHISPER_PORT: int = 8087
    HIN_TTS_ENDPOINT: str = "/predictions/fb_mms_hin_tts"
    HIN_TTS_PORT: int = 4011

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
