# PDF Scan Backend

Node.js + Express + MongoDB backend that:
- accepts PDF uploads
- extracts text
- sends it to an AI provider for structured analysis (Groq, Gemini, or Grok)
- stores results in MongoDB

## Setup

1) Install deps

```bash
npm install
```

2) Create `.env`

```bash
cp .env.example .env
```

3) Run

```bash
npm run dev
```

## API

- `GET /health`
- `POST /api/analysis/upload` (multipart form-data, field name: `pdf`)
- `GET /api/analysis`

## Quick Groq smoke test

```bash
npm run test:groq
```

## Quick Grok smoke test (xAI)

```bash
npm run test:grok
```

## Notes

- Default port is `5001` (set `PORT` in `.env` if you want a different one).
- Provider selection: set `AI_PROVIDER=groq`, `AI_PROVIDER=gemini`, or `AI_PROVIDER=grok`.
- Groq defaults: `GROQ_MODEL=llama-3.3-70b-versatile`.
- Gemini defaults: `GEMINI_API_VERSION=v1beta`, `GEMINI_MODEL=gemini-1.5-flash`.
- Grok defaults: `XAI_API_BASE=https://api.x.ai/v1`, `XAI_MODEL=grok-4.20-reasoning`.
- Chunk analyses are merged in the backend (no AI merge step).
- Chunking defaults: `AI_CHUNK_SIZE=4000`, `AI_MAX_CHUNKS=8`.
- For raw AI output logs, set `AI_LOG_RAW=true`.
- For automatic failure diagnosis (extra AI call on errors), set `AUTO_DEBUG=true`.
