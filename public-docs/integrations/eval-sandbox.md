# Eval Sandbox (optional integration)

A Jupyter-like code execution sandbox that lets agents run Python and JavaScript snippets in a persistent kernel. Variables, imports, and runtime state persist across consecutive tool calls within the same workspace session.

## Why

Without the sandbox, agents that want to test code have to:

1. Call `Write` to create a throwaway script in the project tree
2. Call `Bash` to run it
3. Read the output
4. Either delete the file (clutter) or leave it (noise)
5. **Lose all state** between runs — the next iteration starts from scratch

The eval sandbox avoids all of this:

- State persists across calls (a regex you compiled last turn is still there)
- No files written to your project
- No cleanup needed
- Multi-step data analysis feels natural ("load CSV → filter → plot" in three calls)

## How to enable

The sandbox is **opt-in**. Two ways to enable it:

### 1. Global env var (affects all workspaces)

Set `PASEO_EVAL_SANDBOX=1` in the daemon's environment. Optional: `PASEO_EVAL_SANDBOX_TIMEOUT_MS=30000` (default 30s per cell).

```bash
# Bash / zsh
export PASEO_EVAL_SANDBOX=1
paseo

# Windows PowerShell
$env:PASEO_EVAL_SANDBOX = "1"
paseo
```

### 2. Per-project (paseo.json)

In a project's `paseo.json`:

```json
{
  "integrations": {
    "evalSandbox": {
      "enabled": true,
      "defaultTimeoutMs": 30000
    }
  }
}
```

Per-project is checked at session time. If unset, the sandbox is off for that project.

## Tools exposed to the agent

When enabled, the agent MCP server exposes four tools:

| Tool          | Purpose                                                  |
|---------------|----------------------------------------------------------|
| `eval_python` | Run Python in a persistent kernel (variables preserved)  |
| `eval_js`     | Run JavaScript in a sandboxed Node.js runtime            |
| `eval_reset`  | Destroy one or all sessions, freeing kernel state        |
| `eval_list`   | List active sessions for the current workspace           |

Each call returns stdout, stderr, a structured `display` value, the elapsed time, and the session id.

## System prompt hint

When the sandbox is enabled, the daemon appends a short hint (~80 tokens) to the system prompt so the model knows when to prefer the sandbox over writing throwaway scripts. The hint is small enough to keep token cost low.

## Resource usage

Per active session:

- **Python kernel:** ~30-80 MB RAM (Python startup + imported modules)
- **JS runtime:** ~5-15 MB RAM
- **memfs (in-memory filesystem):** depends on what the agent writes

If you have many workspaces with the sandbox enabled simultaneously, expect ~50-150 MB RAM per active workspace. Memory is freed when:

- The session is explicitly reset via `eval_reset`
- The daemon shuts down
- The user closes the workspace

## Limitations

- **Python availability** is checked at session creation. The Python backend requires a working `python` on `PATH` (or whichever interpreter the implementation resolves to).
- **Security:** the JS backend uses Node's `vm` module (sandboxed). The Python backend uses `ipykernel` if available, with the same caveats as a local Jupyter install. Do not run the daemon on shared/public systems with the sandbox enabled if you don't trust the agent's tools.
- **No file output:** code that writes to disk writes to the in-memory `memfs`, not the real disk. If the agent needs to save a file, it must use the regular `Write` tool.

## Removing the integration

To turn it off:

- Unset `PASEO_EVAL_SANDBOX`, or
- Set `"enabled": false` in the project's `paseo.json` `integrations.evalSandbox`, or
- Simply remove the env var / config field.

No data is persisted to disk by the sandbox itself, so disabling it is a clean off.
