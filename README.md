# Product Description Writer

A client-side React app for generating optimized eCommerce product listings from structured product details, an optional image, and an optional PDF/TXT document.

## Run

```bash
npm install
npm run dev
```

The app calls the Vercel API proxy at `https://pdp-openai-api.vercel.app/api/generate-listing`. Store the OpenAI API key in that Vercel project's `OPENAI_API_KEY` environment variable.

## Build

```bash
npm run build
```
