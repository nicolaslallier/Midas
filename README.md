# Midas

Polyglot monorepo with three independent workspaces:

| Workspace | What | Stack |
|---|---|---|
| [`backend/`](backend/) | Backend | Python 3.14, [uv](https://docs.astral.sh/uv/), ruff, pytest |
| [`functionapp/`](functionapp/) | Function app | Rust (edition 2024), cargo |
| [`frontend/`](frontend/) | Frontend | Vue 3, Vite, TypeScript, npm |

> **Status:** scaffolding only — each workspace is a minimal skeleton, no real functionality yet.

## Quickstart

### Backend (`backend/`)

```sh
cd backend
uv sync                 # create .venv and install dev deps
uv run python -m backend
uv run ruff check .
uv run pytest
```

### Function app (`functionapp/`)

```sh
cd functionapp
cargo run
cargo test
```

### Frontend (`frontend/`)

```sh
cd frontend
npm install
npm run dev             # dev server
npm run build           # type-check + production build
```

## Conventions

See [AGENTS.md](AGENTS.md) for agent guidance and the canonical per-toolchain commands.
