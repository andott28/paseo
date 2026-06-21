---
title: Integrations
description: Optional features you can enable per project or globally.
nav: Integrations
order: 7
category: Integrations
---

# Integrations

Optional features that extend Paseo without bloating the core. Each integration is opt-in — disabled by default, enabled per project or globally.

## Available integrations

- [Eval sandbox](/docs/integrations/eval-sandbox) — Jupyter-like Python/JS execution for agents, with persistent kernel state.

## Adding your own

Integrations live under `packages/server/src/server/<name>/` and follow this pattern:

1. A feature flag in `paseo.json` `integrations.<name>.enabled` (see `packages/protocol/src/paseo-config-schema.ts`)
2. A lifecycle manager (initialize on bootstrap, shutdown on stop)
3. MCP tools exposed when the integration is enabled (gate with `enableXxx` option on `AgentMcpServerOptions`)
4. A small system-prompt hint appended via `appendSystemPrompt` in `config.ts` (keep it under ~100 tokens)
5. A docs page under `public-docs/integrations/`

The eval sandbox is the canonical example to follow.
