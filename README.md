# MoteTalk

A small, private AI chat client for the OpenAI Responses API and compatible endpoints.

## Features

- Multiple API connections and assistant profiles
- Streaming replies with reasoning, token usage, and cost estimates
- Image attachments
- Per-connection model fields and request configuration
- Light, dark, and system themes
- Settings stored locally in the browser

## Run locally

Requires Node.js and pnpm.

```bash
pnpm install
pnpm dev
```

Open the local URL shown by Vite, then configure an API key, Base URL, and model in **Settings**.

## Checks

```bash
pnpm check
pnpm test
pnpm build
```
