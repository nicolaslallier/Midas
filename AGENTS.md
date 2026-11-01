# AGENTS.md

Guidance for AI agents working in this repo. Keep this file short — every line should earn its place.

## Status

**Scaffold landed.** Three independent workspaces, each a minimal skeleton (hello-world level, no real functionality yet). No CI, no shared infra.

## Stack

Polyglot monorepo, three independent toolchains:

| Area | Language | Toolchain |
|---|---|---|
| `backend/` | Python 3.14 | `uv` (+ `ruff`, `pytest`) |
| `functionapp/` | Rust (edition 2024) | `cargo` |
| `frontend/` | TypeScript | `npm` + Vite + Vue 3 |

## Canonical commands

Run each from its workspace directory. These are the standard entrypoints — use them rather than guessing.

### Python (`backend/`, uv)
- Sync deps: `uv sync`
- Run: `uv run python -m backend`
- Lint: `uv run ruff check .` · Format: `uv run ruff format .`
- Tests: `uv run pytest` · single: `uv run pytest path/to/test.py::test_name`

### Rust (`functionapp/`, cargo)
- Build: `cargo build` · Run: `cargo run`
- Test: `cargo test` · single: `cargo test <name>`
- Lint: `cargo clippy` · Format: `cargo fmt`

### Vue / TypeScript (`frontend/`, npm + Vite)
- Install: `npm install`
- Dev server: `npm run dev` · Build: `npm run build` (runs `vue-tsc -b` type-check first) · Preview: `npm run preview`
- Lint / tests: none yet — no ESLint or test runner configured

## Conventions

- Trust executable sources of truth (manifests, config, CI) over this file. If they disagree, the config wins and this file should be updated.
- Keep the three toolchains independent — don't mix package managers or tooling across workspaces.
- Lockfiles (`uv.lock`, `Cargo.lock`, `package-lock.json`) are committed.
- Add team conventions, branch/PR/release rules, and CI expectations here as they're decided.

## To fill in

- Frontend test runner (Vitest vs Jest)
- CI workflow + pre-commit setup
- Branch / PR / release conventions
- Required env vars, services, or infra
