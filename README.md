<img src="public/logo.svg" alt="MoteChat logo" width="80" height="80" />

# MoteChat

A local-first AI chat client for the OpenAI Responses API and compatible endpoints.

[Open the live app](https://lomirus.github.io/motechat/) — chats and settings stay in your browser.

## Features

- Multiple API connections and assistant profiles
- Streaming replies with reasoning, token usage, and cost estimates
- Image attachments
- Per-connection model fields and request configuration
- Light, dark, and system themes

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
