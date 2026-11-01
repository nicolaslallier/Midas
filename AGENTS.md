# AGENTS.md

Guidance for AI agents working in this repo. Keep this file short — every line should earn its place.

## Status

**Fresh scaffold.** The repo currently has no commits and no files (only `.git`, remote `https://github.com/nicolaslallier/Midas.git`, branch `main`). Until code lands, treat the repo as a blank slate: don't assume existing structure, entrypoints, or config. The first time the scaffold is added, reconcile this file with the real manifests/config/CI.

## Planned stack (user-confirmed)

Polyglot monorepo, three independent toolchains:

| Area | Language | Toolchain |
|---|---|---|
| Backend | Python | `uv` (+ `ruff`, `pytest`) |
| Frontend | TypeScript | `npm` + Vite |
| Rust component | Rust | `cargo` |

Intended layout — **confirm/adjust as you scaffold** (names below are placeholders, not yet real):

- `backend/` — Python, uv-managed
- `frontend/` — TypeScript, Vite
- `rust/` — Rust crate(s)

## Canonical commands

Run each from its workspace directory. These are the standard entrypoints — use them rather than guessing.

### Python (`backend/`, uv)
- Sync deps: `uv sync`
- Run: `uv run python -m <module>`
- Lint: `uv run ruff check .` · Format: `uv run ruff format .`
- Type-check: `uv run mypy .` (if configured)
- Tests: `uv run pytest` · single: `uv run pytest path/to/test.py::test_name`

### TypeScript (`frontend/`, npm + Vite)
- Install: `npm install`
- Dev server: `npm run dev` · Build: `npm run build`
- Type-check: `npm run typecheck` (or `npx tsc --noEmit`) · Lint: `npm run lint`
- Tests: `npm test` (runner TBD — Vitest/Jest)

### Rust (`rust/`, cargo)
- Build: `cargo build` · Run: `cargo run`
- Test: `cargo test` · single: `cargo test <name>`
- Lint: `cargo clippy` · Format: `cargo fmt`

## Conventions

- **Trust executable sources of truth** (manifests, config, CI) over this file. If they disagree, the config wins and this file should be updated.
- Keep the three toolchains independent — don't mix package managers or tooling across workspaces.
- Add team conventions, branch/PR/release rules, and CI expectations here as they're decided.

## To fill in once the scaffold lands

- Exact workspace directory names and real entrypoints
- Frontend test runner (Vitest vs Jest)
- CI workflow + pre-commit setup
- Branch / PR / release conventions
- Required env vars, services, or infra
