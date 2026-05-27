## Accuracy, recency, and sourcing (REQUIRED)

When a request depends on recency (e.g., "latest", "current", "today", "as of now"):

1. **Establish the current date/time** and state it explicitly in ISO format.
   - Preferred: `date -Is` (timestamp).

2. **Prefer official / primary sources** when researching:
   - Upstream vendor docs for any dependency (language runtime, framework, cloud provider, etc.)

3. **Prefer the most recent authoritative information**:
   - Use the newest versioned docs, release notes, or changelogs.
   - Cross-check at least two reputable sources when details are safety/compatibility sensitive.


### Web search policy

- Enable and use web search only when it materially improves correctness (e.g., up-to-date APIs, recent advisories, release notes).
- Prefer official docs and primary sources; otherwise use Context7 MCP or reputable, widely-cited references.
- Record source dates (publish/release dates) when relevant.

## Default autonomy and safety

- Default to read-only exploration and analysis.
- When edits are needed, prefer **workspace-scoped** write access and keep changes inside the repo.
- When interacting with remote APIs, you must use READ-only calls, unless explicitily instructed otherwise by the user. If the user requests an API WRITE-based command, perform it as a dry-run first. You must never make destructive calls to remote APIs or production data sources.

### Editing files

- Make the smallest safe change that solves the issue.
- Preserve existing style and conventions.
- Prefer patch-style edits (small, reviewable diffs) over full-file rewrites.
- After making changes, run the project’s standard checks when feasible (format/lint, unit tests, build/typecheck).
- Fix the underlying problem rather than temporary fixes.

### Reading project documents (PDFs, uploads, long text, CSVs, etc)

- Read the full document first.
- Draft the output.
- **Before finalizing**, re-read the original source to verify:
  - factual accuracy,
  - no invented details,
  - wording/style is preserved unless the user explicitly asked to rewrite.
- If paraphrasing is required, label it explicitly as a paraphrase.

### Container-first policy (REQUIRED)

- You must **never** install system packages on the host unless explicitly instructed.
- Prefer container images to supply all tooling used by the project.
- For code projects and dependencies: **use containers by default**.
- If the repo has an existing container workflow (Dockerfile/compose/Makefile targets), follow it.
- If the repo has no container workflow, create a minimal one.
- Keep repo-specific container details in the repo’s `AGENTS.md`.

### Secrets and sensitive data

- Never print secrets (tokens, private keys, credentials) to terminal output.
- Do not request users paste secrets.
- Avoid commands that might expose secrets (e.g., dumping env vars broadly, `cat ~/.ssh/*`).
- Prefer existing authenticated CLIs; redact sensitive strings in any displayed output.

## Baseline workflow

- Start every task by determining:
  1. Goal + acceptance criteria.
  2. Constraints (time, safety, scope).
  3. What must be inspected (files, commands, tests, docs).
  4. Whether the request depends on **recency** (if yes, apply the "Accuracy, recency, and sourcing" rules).
  5. If requirements are ambiguous, ask targeted clarifying questions before making irreversible changes.

## CONTINUITY.md (REQUIRED)

Maintain a single continuity file for the current workspace: `.agent/CONTINUITY.md`.

- `.agent/CONTINUITY.md` is a living document and canonical briefing designed to survive compaction; do not rely on earlier chat/tool output unless it's reflected there.

- At the start of each assistant turn: read `.agent/CONTINUITY.md` before acting.

### File Format

Update `.agent/CONTINUITY.md` only when there is a meaningful delta in:

  - `[PLANS]`: "Plans Log" is a guide for the next contributor as much as checklists for you.
  - `[DECISIONS]`: "Decisions Log" is used to record all decisions made.
  - `[PROGRESS]`: "Progress Log" is used to record course changes mid-implementation, documenting why and reflecting upon the implications.
  - `[DISCOVERIES]`: "Discoveries Log" is for when when you discover optimizer behavior, performance tradeoffs, unexpected bugs, or inverse/unapply semantics that shaped your approach, capture those observations with short evidence snippets (test output is ideal).
  - `[OUTCOMES]`: "Outcomes Log" is used at completion of a major task or the full plan, summarizing what was achieved, what remains, and lessons learned.

### Anti-drift / anti-bloat rules

- Facts only, no transcripts, no raw logs.
- Every entry must include:
  - a date in ISO timestamp (e.g., `2026-01-13T09:42Z`)
  - a provenance tag: `[USER]`, `[CODE]`, `[TOOL]`, `[ASSUMPTION]`
  - If unknown, write `UNCONFIRMED` (never guess). If something changes, supersede it explicitly (don't silently rewrite history).
- Keep the file bounded, short and high-signal (anti-bloat). 
- If sections begin to become bloated, compress older items into milestone (`[MILESTONE]`) bullets.

## Change discipline: modify vs. create, scope, and modularity

This project has a small number of well-defined modules. Before writing new code,
understand what already exists and whether a change belongs in an existing file.

### File responsibilities

| File | What it owns | When to touch it |
|---|---|---|
| `ssm_attention.py` | `SSMAttentionConfig`, `SSMAttention` (the core recurrent SSM module, a drop-in for `GPT2Attention`) | Any change to the SSM architecture, config fields, or forward logic. |
| `train_ssm.py` | Distillation training loop (teacher forcing, scheduled noise, MSE+cosine loss, early stopping, checkpointing) | Changes to loss functions, training schedule, data loading, or checkpoint logic. |
| `evaluate.py` | DLKL measurement, `HybridAttention`, checkpoint loading, alpha-blended evaluation | New evaluation metrics, hybrid attention variants, or changes to how checkpoints are loaded. |
| `collect_activations.py` | GPT-2 hook-based activation capture, per-layer train/val `.pt` files | Changes to how activations are collected, chunking, or which layers are targeted. |
| `alpha_sweep.py` | Grid search over alpha values for a target DLKL threshold | Changes to the sweep logic, threshold, or reporting format. |
| `run_experiment.py` | Unified CLI orchestrator that chains collection → training → evaluation | Adding a new pipeline phase, changing CLI flags, or reordering the workflow. |
| `__init__.py` | Public API exports and the convenience `run_experiment()` entry point | Adding/removing public symbols from the package. |

### Rules of thumb

1. **Prefer modifying an existing file over creating a new one.** If the new concern
   is tightly coupled to an existing module's responsibility, add to that file.
   A new file is warranted only when the concern is *orthogonal* — it has no
   natural home and adding it would dilute the module's single responsibility.

2. **Do not create God Objects.** Conversely, do not keep dumping unrelated logic
   into a single file just because it already exists. If a module has grown beyond
   its original scope (e.g., `evaluate.py` now also trains models, `ssm_attention.py`
   now contains CLI parsing), split off the orthogonal concern into a new file.
   **The deciding question:** "Does this change preserve the file's single
   responsibility, or does it blur it?" If the latter, create the new file.

3. **No speculative fallbacks.** Do not add `try`/`except` that catches broad
   exceptions, default-value branches that paper over missing data, or retry
   loops "just in case." If a precondition can genuinely fail, fail early and
   let the caller decide. If a fallback is truly needed, the task description
   will say so.

4. **No feature creep.** Before adding a parameter, configuration flag, or
   convenience wrapper, ask: "Does the task *specifically* require this, or am I
   guessing it might be useful later?" If the latter, leave it out. Add
   generality only when the current task demands it.

5. **Evaluate before you build.** When the task is ambiguous or open-ended
   ("improve training", "make it more robust"), first read the relevant files
   and formulate a hypothesis. Present your plan (with alternatives) before
   writing code. Do not start coding speculatively.

The tension between rule 1 ("modify existing") and rule 2 ("no God objects")
is intentional. The tiebreaker is **single-responsibility scope**: if the change
fits naturally alongside the existing content of the file, modify. If it would
require adding a conceptually distinct concern, split. When in doubt, ask.

## Definition of done

A task is done when:

- the requested change is implemented or the question is answered,
  - verification is provided:
  - build attempted (when source code changed),
  - linting run (when source code changed),
  - errors/warnings addressed (or explicitly listed and agreed as out-of-scope),
  - plus tests/typecheck as applicable,
- documentation is updated exhaustively for impacted areas,
- impact is explained (what changed, where, why),
- follow-ups are listed if anything was intentionally left out.
- `.agent/CONTINUITY.md` is updated if the change materially affects goal/state/decisions.