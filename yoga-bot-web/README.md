# YogaBot Web

Web-based FastAPI frontend for the Yoga RAG bot. Replaces the WhatsApp client with a browser UI (English & Hindi).

## Setup

```bash
cd yoga-bot-web
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env
# Edit .env: set API_BASE_URL to your RAG backend (e.g. http://agribot:8899)
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000 . Choose language (eng/hin), then chat. Use **M** for main menu; **1** = new session, **2** = history, **3** = change language. Use **Record** to send a voice message (browser mic → ASR → same chat flow as Node.js).

## API

- `POST /api/chat` — send message (JSON: `message`, `client_id`, optional `language`)
- `GET /api/session/{client_id}` — session info
- `GET /api/history/{client_id}` — chat history
- `GET /api/menu` — language menu copy
- `POST /api/voice` — upload audio (multipart: `audio`, form: `client_id`, `language`)

Docs: http://localhost:8000/docs

## Docker

```bash
docker build -t yogabot-web .
docker run -p 8000:8000 -e API_BASE_URL=http://host.docker.internal:8899 yogabot-web
```

## Environment

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default 8000) |
| `API_BASE_URL` | RAG backend base URL (e.g. `http://localhost:8899`) |
| `TTS_BASE_ENDPOINT` | Host for TTS and ASR (Whisper/Conformer) services |
