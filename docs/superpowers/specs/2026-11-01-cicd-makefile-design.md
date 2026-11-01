# Design: CI/CD Managed by Makefile

Date: 2026-11-01
Status: ready for owner review

## Context and intent

Midas is a polyglot monorepo with three independent workspaces, all currently at
hello-world level:

| Workspace | Stack |
|---|---|
| `backend/` | Python 3.14, `uv` (ruff, pytest) |
| `functionapp/` | Rust, edition 2024, `cargo` |
| `frontend/` | Vue 3 + Vite + TypeScript, `npm` |

The repo is hosted on GitHub (`nicolaslallier/Midas`, **public**). There is no
CI and no deployment path today (AGENTS.md: "No CI, no shared infra").

**Intent:** a single Makefile at the repo root is the one entry point for all
CI/CD — `make ci` for the quality gate, `make deploy` for shipping.

**Deployment target:** a Portainer stack on the owner's always-on home server
**192.168.2.10** (Windows + Docker Desktop, WSL2 Linux engine). Portainer CE
**2.45.0** already runs there, published on `192.168.2.10:9000` (verified).
GitHub cloud runners cannot reach that LAN, so the deploy job runs on a
**self-hosted runner that lives as a Linux container on 192.168.2.10** — the
same pattern the host already uses for its other projects (it runs four
`myoung34/github-runner:ubuntu-noble` containers, currently crash-looping).
The Makefile is the command surface of that runner: the workflow calls
`make ci` (cloud), then `make images` + `make deploy` (self-hosted), and
`make deploy` talks to Portainer over the LAN. Nothing on the home server is
exposed to the internet.

## Goals

1. Root `Makefile`: the single entry point for all CI/CD operations (lint, test, build, images, deploy, stack, clean). POSIX shell — runs in the runner container (Ubuntu) and on the owner's Mac.
2. GitHub Actions workflow (`.github/workflows/cicd.yml`):
   - `ci` job on **GitHub-hosted `ubuntu-latest`** — on PRs and on push to `main`: `make ci` (lint + test + build for all three workspaces).
   - `deploy` job on the **self-hosted runner (label `midas`)** — on push to `main` only: `make images` + `make deploy`, with the Portainer secrets.
3. `docker-compose.yml` in the repo defining the `midas` stack: three services — `backend`, `functionapp`, `frontend`.
4. One `Dockerfile` per workspace.
5. `make deploy` creates or updates the stack through the **Portainer API** (`http://192.168.2.10:9000`, token), so the stack stays visible and manageable from the Portainer UI.
6. Self-hosted runner for Midas: a Linux container on 192.168.2.10 (label `midas`, host docker socket mounted, `make` + `node` inside).
7. `docs/cicd.md`: one-time setup and operations, written from the **Windows host** perspective (Docker Desktop, runner container, Portainer token, GitHub secrets, first deploy).
8. `AGENTS.md` updated (canonical commands gain the Makefile; "CI workflow" to-fill-in line is resolved).

## Non-goals

- Real application functionality — the apps stay hello-world; that is separate work.
- Container registry — no image push; images are built on the deployment host, which is where they run.
- Pre-commit setup — remains a "to fill in" item in AGENTS.md.
- Production hardening: TLS/HTTPS, multiple replicas, monitoring, backups.
- The host's four pre-existing crash-looping runner containers — out of scope, flagged to the owner.
- Changing application source code beyond what the Dockerfiles require (and even that stays minimal).

## Anti-goals (what would make this a failure)

- **Untrusted PR code executing on the home server.** The repo is public, so anyone can open a PR; a PR's checkout (including a modified `Makefile`) is exactly what `make ci` would execute. Therefore PR CI runs on GitHub-hosted runners, and only the deploy job (push to `main`, owner-only) runs on the self-hosted runner.
- A Makefile that duplicates or overrides the workspaces' toolchains instead of calling their canonical commands (AGENTS.md: "Keep the three toolchains independent").
- A deployment that bypasses Portainer (raw `docker compose` on the host).
- Any deployment that requires manual steps after the one-time setup.
- Exposing the home server or the Portainer UI to the internet.

## Constraints

- Three independent toolchains: `uv` (Python 3.14), `cargo` (Rust 2024), `npm` (Node/Vite). The Makefile orchestrates; it never mixes them.
- Host (verified): Windows, Docker Desktop 4.97 with the **Linux** engine (WSL2, context `desktop-linux`), Compose v5.6.1, Node installed natively, no `make`/`uv`/`cargo` natively (they live in the runner container).
- The runner container mounts the host docker socket → `docker build` runs on the host engine; built images are visible to the Portainer endpoint on the same host.
- From the runner container, Portainer is reached at `http://192.168.2.10:9000` (verified reachable; `127.0.0.1:9000` is not bound on the host and is the container itself from inside).
- Lockfiles are committed (`uv.lock`, `Cargo.lock`, `package-lock.json`) → reproducible builds.
- The current apps print a greeting and exit; containers need a documented keep-alive placeholder until the apps become long-running services.

## Decisions (owner's)

- The root Makefile is the single CI/CD entry point.
- CD target: **Portainer stack on 192.168.2.10**, which **must update on every merge/write to `main`**.
- Stack contents: three services, one per workspace, skeleton for now, to grow with the apps.
- The host is on 24/7; the owner grants the builder **SSH access (`this@192.168.2.10`)** → the builder performs the one-time setup and verifies the pipeline end-to-end against the live Portainer, not just code + docs.

## Decisions (author's calls — owner to review)

- **PR CI on GitHub-hosted runners** (`ubuntu-latest`), including for pushes to `main`; only the deploy job runs self-hosted. This keeps untrusted fork-PR code off the home server (repo is public) and costs nothing (public repos get free hosted minutes). If the repo later goes private and the owner wants everything local, it is a one-line `runs-on` flip.
- **Self-hosted runner = a Linux container on the host**, following the host's existing runner-as-container pattern, label `midas`, docker socket mounted, `make` + `node` inside (all the deploy job needs). Exact image choice (host's `myoung34` pattern vs official `actions/runner` + docker CLI) is the builder's call, verified live — the existing `myoung34` containers are crash-looping.
- **Portainer integration via API.** Environment variables: `PORTAINER_URL` (default `http://192.168.2.10:9000`), `PORTAINER_API_TOKEN` (required), `PORTAINER_ENDPOINT_ID` (required), `PORTAINER_STACK_NAME` (default `midas`). Flow: list stacks → if a stack with the same name exists, update it (PUT); otherwise create it (POST, Compose file in the `ComposeFile` field). Exact API fields verified against the live 2.45.0 API during implementation.
- **Deploy script in Node** (`scripts/portainer-deploy.mjs`): reads `docker-compose.yml`, builds the JSON body, calls the API with create-or-update semantics — runs identically in the runner container and on the owner's Mac (Node exists in both).
- **No registry.** `make images` builds `midas-backend:<tag>`, `midas-functionapp:<tag>`, `midas-frontend:<tag>` on the host; the compose file references the same tags. Tag = short git SHA (fallback `dev` outside a git checkout).
- **Keep-alive placeholders.** The `backend` and `functionapp` containers run their real entrypoint, then `tail -f /dev/null` (commented: replace when the app becomes long-running). The `frontend` is genuinely long-running: multi-stage Node build → nginx serving `dist/`.
- **Ports.** `frontend` published on `8080:80` (verified free on the host); `backend`/`functionapp` expose no ports yet (add when the apps need them).
- **File layout:** root `Makefile`, root `docker-compose.yml`, `backend/Dockerfile`, `functionapp/Dockerfile`, `frontend/Dockerfile`, `scripts/portainer-deploy.mjs`, `deploy/runner.yml` (runner container definition, keeps the repo self-contained), `.github/workflows/cicd.yml`, `docs/cicd.md`.
- **Makefile target set (suggested):** `ci` (lint + test + build for all three workspaces), per-workspace targets (e.g. `backend-test`, `frontend-build`), `images`, `deploy`, `stack-up` / `stack-down` (local convenience via `docker compose`), `clean`.
- **Acceptance bar:** runner registered and online; `make ci` green in the cloud; a real `make deploy` creates the `midas` stack in Portainer with three running containers; frontend reachable at `192.168.2.10:8080`.

## One-time setup

- **Builder (via SSH on 192.168.2.10):** create and start the runner container, verify toolchain + docker socket + Portainer reachability from inside it, run the first deploy end-to-end.
- **Owner:**
  1. Create a Portainer user with stack permissions on the endpoint and generate an API token (UI at `192.168.2.10:9000`); note the endpoint ID.
  2. Generate the self-hosted runner registration token (repo → Settings → Actions → Runners → New self-hosted runner, Linux) and hand both to the builder, or add them as GitHub secrets (`PORTAINER_API_TOKEN`, `PORTAINER_ENDPOINT_ID`) and let the builder register the runner.
- `docs/cicd.md` records all of the above so the setup can be recreated from scratch.

## Left to the builder

- Runner container image: base choice (community `myoung34` vs official `actions/runner` + docker CLI), toolchain versions, socket mount, restart policy, where the one-time registration token is consumed.
- Portainer API specifics: create-vs-update flow, error handling, idempotency, behaviour when the stack is missing or the API is unreachable.
- Per-workspace Dockerfile specifics: base images (Python 3.14, Rust, Node), non-root users, minimal image sizes, the frontend nginx config.
- Workflow YAML specifics: concurrency group, timeouts, failure behaviour.
- `docs/cicd.md` content (Windows-host perspective: Docker Desktop, runner container lifecycle, Portainer token, secrets, first-deploy walkthrough).
- `AGENTS.md` updates: canonical commands (add the Makefile targets), resolve the "CI workflow" to-fill-in line, keep pre-commit.
