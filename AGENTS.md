# AGENTS.md

## Scope
These instructions apply to the entire repository rooted at this directory.

## MCP-First Policy
- Always prioritize MCP tools before falling back to raw shell/file output.
- Preferred order for coding tasks:
  1. `serena` for semantic code navigation, symbol lookup, and code edits.
  2. `context-mode` for large-output processing and context-size control.
  3. Native shell/file tools only when MCP cannot complete the task.

## Required MCP Usage Rules
- For repository exploration, symbol tracing, refactors, and multi-file edits: use `serena` first.
- For large logs, long command output, broad searches, docs ingestion, and data-heavy reads: use `context-mode` tools (`ctx_execute`, `ctx_execute_file`, `ctx_batch_execute`, `ctx_fetch_and_index`, `ctx_search`).
- Do not paste large raw outputs into chat context when `context-mode` can summarize/search them.
- If an MCP server is unavailable, state the reason briefly and continue with the best fallback.

## Token Efficiency Defaults
- Keep context compact; summarize instead of dumping full outputs.
- Prefer targeted queries over full-file reads.
- Reuse indexed/searchable results from `context-mode` when possible.

## Project Workflow Note
- Current project focus is Phase 3 auth/session + user-wallet constraints.
- While implementing Phase 3, enforce MCP-first behavior above in every step.
