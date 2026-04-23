# PDF Scan Backend

Node.js + Express + MongoDB backend that:
- accepts PDF uploads
- extracts text
- sends it to OpenAI for structured analysis
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

## Notes

- Default port is `5001` (set `PORT` in `.env` if you want a different one).

# pdf-backend-
