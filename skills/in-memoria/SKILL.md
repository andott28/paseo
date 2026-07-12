---
name: in-memoria
description: Set up and use In-Memoria, an MCP server that learns from your codebase and remembers across sessions. Use when the user asks to set up In-Memoria, configure codebase intelligence, or integrate persistent codebase memory into their Paseo agents.
user-invocable: true
argument-hint: "[setup|learn|check|config]"
---

# In-Memoria

In-Memoria is an MCP server that learns from your codebase and remembers across sessions. It builds persistent intelligence about patterns, architecture, conventions, and decisions that agents query via MCP. It reduces project context tokens by ~93% by eliminating redundant re-analysis.

The intelligence database lives under `~/.paseo/in-memoria/<project>/` -- scoped per project, no files in your repo. Paseo's daemon provisions the base directory and auto-injects In-Memoria into agents with per-project storage.

## Enable via Settings

Toggle **Enable In-Memoria** in Settings > Host > Agents. This:

- Injects In-Memoria as a stdio MCP server into every new agent session
- Stores intelligence per project at `~/.paseo/in-memoria/<sanitized-cwd>/`
- Tells agents about In-Memoria in their system prompt so they know to query it

No config.json editing needed. The toggle is live -- no daemon restart.

## One-Time Learning Pass

Before agents can query the intelligence, build it once per project:

```bash
IN_MEMORIA_STORAGE_DIR=~/.paseo/in-memoria/<sanitized-cwd> npx in-memoria learn ./src
npx in-memoria check ./src --verbose
```

For a large codebase (10K+ files), expect ~2-5 minutes. The intelligence updates incrementally afterward.

## Optional: Auto-Watch

Keep intelligence fresh automatically during development:

```bash
IN_MEMORIA_STORAGE_DIR=~/.paseo/in-memoria/<sanitized-cwd> npx in-memoria watch ./src
```

## Manual Per-Agent MCP Config

If the daemon toggle isn't used, configure In-Memoria per agent:

```json
{
  "mcpServers": {
    "in-memoria": {
      "type": "stdio",
      "command": "npx",
      "args": ["in-memoria", "server"],
      "env": {
        "IN_MEMORIA_STORAGE_DIR": "~/.paseo/in-memoria/my-project"
      }
    }
  }
}
```

## How Paseo Agents Use In-Memoria

Once connected, agents have access to In-Memoria's tools and can query:

- **Project structure**: tech stack, entry points, architecture
- **Code patterns**: naming conventions, error handling, patterns used
- **Smart file routing**: "add password reset" maps to the correct file
- **Semantic search**: find code by meaning, not keywords
- **Work context**: track decisions, tasks, approach consistency across sessions

When the toggle is on, agents receive this in their system prompt:

> In-Memoria codebase intelligence is available. Query it to discover project patterns, file routing, and architectural conventions. It persists across sessions -- ask it about the codebase before writing code.

## Troubleshooting

| Issue                      | Fix                                                                     |
|----------------------------|-------------------------------------------------------------------------|
| Learn fails                | Verify path is correct; check file permissions                          |
| Agent doesn't see new code | Start watch: `IN_MEMORIA_STORAGE_DIR=<path> npx in-memoria watch ./src` |
| Server won't start         | Run `check --verbose` first; if issues: `rm <path>/*.db && npx in-memoria learn ./src` |
| Toggle has no effect       | Ensure `npx in-memoria server` works from terminal first                |

## Architecture

| Layer               | Database         | Location                                      |
|---------------------|------------------|-----------------------------------------------|
| Structured data     | SQLite           | `<basePath>/<project>/in-memoria.db`          |
| Vector embeddings   | SurrealKV (embedded) | `<basePath>/<project>/in-memoria-vectors.db`  |
| Embedding model     | Local (All-MiniLM-L6-v2) | In-process, no network calls            |

No ports. No separate server process. Everything runs via stdio MCP transport, managed by Paseo's daemon.
