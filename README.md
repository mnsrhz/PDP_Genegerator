# Product Description Writer

A client-side React app for generating optimized eCommerce product listings from structured product details, an optional image, and an optional PDF/TXT document.

## Configure

Create a local `.env` file with your OpenAI API key:

```bash
OPENAI_API_KEY=your-openai-api-key
```

The `.env` file is ignored by git so the key is not bundled into the browser app or committed to source control.

## Run

```bash
npm install
npm run dev
```

The React app calls a same-origin `/api/generate-listing` endpoint. That endpoint runs in Vite dev/preview and forwards requests to OpenAI using `OPENAI_API_KEY` from the server environment.

## Build

```bash
npm run build
```

The production build is static frontend output. To keep the API key protected in a deployed app, host the `/api/generate-listing` logic on a server or serverless platform instead of deploying only to GitHub Pages.
