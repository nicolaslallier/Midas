# CI/CD Makefile Implementation Plan

> **For the executor:** Steps use checkbox (`- [ ]`) syntax for tracking. Work on branch `cicd/makefile` off `main`.

**Spec:** `docs/superpowers/specs/2026-11-01-cicd-makefile-design.md` (owner-approved)
**Goal:** Root Makefile as the single CI/CD entry point; `make ci` green on GitHub-hosted runners for PRs; `make images` + `make deploy` on a self-hosted runner container that ships the `midas` stack to Portainer on 192.168.2.10.
**Architecture:** One root Makefile orchestrating three independent toolchains (never mixing them). GitHub Actions workflow with a cloud `ci` job (untrusted PR code stays off the home server — repo is public) and a self-hosted `deploy` job (push to `main` only). Deploy talks to the Portainer 2.45.0 API over the LAN via a dependency-free Node script. No registry: images build on the deployment host, where they run.
**Tech Stack:** GNU Make (POSIX sh), GitHub Actions, Docker, Portainer API, Node (global `fetch`, no deps), uv / cargo / npm as the workspaces' own toolchains.

**Verification (acceptance bar, from spec):** runner registered and online; `make ci` green in the cloud; a real `make deploy` creates the `midas` stack in Portainer with three running containers; frontend reachable at `http://192.168.2.10:8080`; a second push updates the stack in place.

---

## File structure

| File | Action | Purpose |
|---|---|---|
| `Makefile` | create | Single CI/CD entry point: `ci`, per-workspace targets, `images`, `deploy`, `stack-up/down`, `clean` |
| `docker-compose.yml` | create | The `midas` stack: 3 services, `midas-*:${MIDAS_TAG:-dev}` images |
| `backend/Dockerfile` | create | Python 3.14 + uv, non-root, keep-alive placeholder |
| `functionapp/Dockerfile` | create | Multi-stage Rust, non-root, keep-alive placeholder |
| `frontend/Dockerfile` | create | Multi-stage Node build → nginx |
| `frontend/nginx.conf` | create | SPA static serving on :80 |
| `scripts/portainer-deploy.mjs` | create | Create-or-update stack via Portainer API; `--dry-run` self-check |
| `deploy/Dockerfile` | create | Runner image: `myoung34/github-runner:ubuntu-noble` + `make` + `node` |
| `deploy/runner.yml` | create | Runner container definition (socket mount, labels, restart policy) |
| `.github/workflows/cicd.yml` | create | `ci` (hosted) + `deploy` (self-hosted `midas`) jobs |
| `.gitignore` | modify | Add `deploy/.env` (one-time registration token) |
| `docs/cicd.md` | create | One-time setup + operations, Windows-host perspective |
| `AGENTS.md` | modify | Makefile as canonical entry point; resolve "CI workflow" to-fill-in line |

Note vs spec file layout: `deploy/Dockerfile` and `frontend/nginx.conf` are additions — the spec left the runner image choice to the builder (goal 6 requires `make` + `node` inside, which the base image lacks) and the nginx config is the frontend Dockerfile's companion.

---

### Task 1: Root Makefile

**Files:**
- Create: `Makefile`

**Current behavior:** no Makefile; each workspace is driven by its own toolchain from its own directory.
**New behavior:** one `make` target set at the repo root; workspaces keep their canonical commands (AGENTS.md anti-goal: the Makefile orchestrates, never overrides toolchains).

- [ ] Create `Makefile`:

```make
# Midas — single entry point for all CI/CD operations.
# POSIX sh: runs on GitHub-hosted runners, the self-hosted runner container, and the owner's Mac.

SHELL := /bin/sh
TAG ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo dev)

.PHONY: ci backend-ci functionapp-ci frontend-ci images deploy stack-up stack-down clean

# Quality gate: lint + test (+ type-check/build where applicable) for all three workspaces.
ci: backend-ci functionapp-ci frontend-ci

backend-ci:
	cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest

functionapp-ci:
	cd functionapp && cargo fmt --check && cargo clippy --all-targets && cargo test

frontend-ci:
	cd frontend && npm ci && npm run build

# Build the three images, tagged with the git SHA (or `dev` outside a checkout).
images:
	MIDAS_TAG=$(TAG) docker compose build

# Ship the current tag as the `midas` stack via the Portainer API.
deploy:
	MIDAS_TAG=$(TAG) node scripts/portainer-deploy.mjs

# Local convenience (requires Docker on the machine running it).
stack-up:
	MIDAS_TAG=$(TAG) docker compose up -d

stack-down:
	docker compose down

clean:
	docker compose down --remove-orphans
	-docker image rm $$(docker images -q --filter reference='midas-*')
```

Notes:
- `uv run` auto-syncs the venv; no explicit `uv sync` step (canonical commands unchanged).
- Frontend has no lint/test runner (AGENTS.md); its gate is `npm run build`, which runs `vue-tsc -b` first.
- `clean`'s `-` prefix: removing zero images must not fail the target.

- [ ] Verify (from repo root, on a machine with uv + cargo + npm):

```sh
make ci
```

Expected: backend ruff/pytest green, cargo fmt/clippy/test green, `vue-tsc -b && vite build` green. Exit 0.
- [ ] Verify the tag logic outside git still works:

```sh
make -n images
```

Expected: prints `MIDAS_TAG=dev docker compose build` (or the short SHA inside the checkout).

**DONE when:** `make ci` exits 0 from the repo root with all three workspaces green.

---

### Task 2: docker-compose.yml + the three Dockerfiles

**Files:**
- Create: `docker-compose.yml`
- Create: `backend/Dockerfile`
- Create: `functionapp/Dockerfile`
- Create: `frontend/Dockerfile`
- Create: `frontend/nginx.conf`

**Current behavior:** no container definitions; all three apps print a greeting and exit.
**New behavior:** each workspace builds to a `midas-*` image; backend/functionapp keep-alive via `tail -f /dev/null` after their real entrypoint (documented placeholder); frontend is genuinely long-running (nginx serving `dist/`) on host port 8080 (verified free on 192.168.2.10).

- [ ] Create `docker-compose.yml`:

```yaml
services:
  backend:
    image: midas-backend:${MIDAS_TAG:-dev}
    build:
      context: ./backend
    restart: unless-stopped

  functionapp:
    image: midas-functionapp:${MIDAS_TAG:-dev}
    build:
      context: ./functionapp
    restart: unless-stopped

  frontend:
    image: midas-frontend:${MIDAS_TAG:-dev}
    build:
      context: ./frontend
    restart: unless-stopped
    ports:
      - "8080:80"
```

- [ ] Create `backend/Dockerfile`:

```dockerfile
FROM python:3.14-slim

WORKDIR /app
COPY pyproject.toml uv.lock ./
COPY src/ ./src/
RUN pip install --no-cache-dir uv && uv sync --frozen --no-dev

RUN useradd -m appuser && chown -R appuser /app
USER appuser

# ponytail: keep-alive placeholder — replace when the backend becomes a long-running service
CMD ["sh", "-c", "uv run python -m backend && tail -f /dev/null"]
```

- [ ] Create `functionapp/Dockerfile`:

```dockerfile
FROM rust:1.95 AS build
WORKDIR /app
COPY . .
RUN cargo build --release

FROM rust:1.95-slim
COPY --from=build /app/target/release/functionapp /usr/local/bin/functionapp
USER 65534

# ponytail: keep-alive placeholder — replace when functionapp becomes a long-running service
CMD ["sh", "-c", "functionapp && tail -f /dev/null"]
```

If `docker build` fails to pull `rust:1.95`, bump to the latest stable tag that exists (edition 2024 needs ≥ 1.85) and note the chosen tag in `docs/cicd.md`.

- [ ] Create `frontend/Dockerfile`:

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.28-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
```

- [ ] Create `frontend/nginx.conf`:

```
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] Verify (requires Docker — builder's Mac, or the host via SSH):

```sh
make images
make stack-up
docker ps
curl -s http://localhost:8080 | head -5
docker logs midas-backend --tail 5   # container name may differ; use `docker ps` output
```

Expected: three `Up` containers; curl returns the Vue app's HTML; backend logs show `Hello, Midas!` then stay alive (no restart loop — `docker ps` shows no restart count climbing).
- [ ] Tear down: `make stack-down`

**DONE when:** `make images && make stack-up` yields three running containers and `curl :8080` serves the frontend.

---

### Task 3: `scripts/portainer-deploy.mjs`

**Files:**
- Create: `scripts/portainer-deploy.mjs`

**Current behavior:** none.
**New behavior:** reads `docker-compose.yml`, substitutes the live tag, and create-or-updates the `midas` stack through the Portainer API (spec: exact API fields verified against live 2.45.0 in Task 6). Dependency-free — Node ≥ 18 global `fetch`, runs identically in the runner container and on the Mac.

- [ ] Create `scripts/portainer-deploy.mjs`:

```js
#!/usr/bin/env node
// Deploy docker-compose.yml to Portainer as a stack (create-or-update).
// Env: PORTAINER_URL (default http://192.168.2.10:9000), PORTAINER_API_TOKEN (required),
//      PORTAINER_ENDPOINT_ID (required), PORTAINER_STACK_NAME (default midas), MIDAS_TAG (default git SHA).
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const url = process.env.PORTAINER_URL ?? 'http://192.168.2.10:9000';
const token = process.env.PORTAINER_API_TOKEN;
const endpointId = process.env.PORTAINER_ENDPOINT_ID;
const name = process.env.PORTAINER_STACK_NAME ?? 'midas';

if (!token) {
  console.error('PORTAINER_API_TOKEN is required');
  process.exit(1);
}
if (!endpointId) {
  console.error('PORTAINER_ENDPOINT_ID is required');
  process.exit(1);
}

const tag =
  process.env.MIDAS_TAG ||
  (() => {
    try {
      return execSync('git rev-parse --short HEAD').toString().trim();
    } catch {
      return 'dev';
    }
  })();

let compose = readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8');
compose = compose.replaceAll('${MIDAS_TAG:-dev}', tag);

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

const api = (path, opts = {}) =>
  fetch(`${url}${path}`, { ...opts, headers }).then(async (res) => {
    if (!res.ok) {
      throw new Error(`Portainer ${path} failed: ${res.status} ${await res.text()}`);
    }
    return res.status === 204 ? null : res.json();
  });

if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify({ url, name, endpointId, tag, compose }, null, 2));
  process.exit(0);
}

const stacks = await api(`/api/stacks?endpointId=${endpointId}`);
const existing = stacks.find((s) => s.Name === name);

if (existing) {
  await api(`/api/stacks/${existing.ID}`, {
    method: 'PUT',
    body: JSON.stringify({ EndpointId: Number(endpointId), Name: name, ComposeFile: compose }),
  });
  console.log(`Updated stack "${name}" (id ${existing.ID}) with tag ${tag}`);
} else {
  const created = await api('/api/stacks', {
    method: 'POST',
    body: JSON.stringify({ Name: name, EndpointId: Number(endpointId), ComposeFile: compose, Prune: false }),
  });
  console.log(`Created stack "${name}" (id ${created?.ID ?? '?'}) with tag ${tag}`);
}
```

- [ ] Verify the self-check (no live API needed):

```sh
MIDAS_TAG=testnode node scripts/portainer-deploy.mjs --dry-run
```

Expected: JSON payload where every image tag is `midas-*:testnode`; exit 0.
- [ ] Verify missing-env failure is clean:

```sh
node scripts/portainer-deploy.mjs --dry-run
```

Expected: `PORTAINER_API_TOKEN is required`, exit 1.

**DONE when:** both checks above behave as expected.

---

### Task 4: `.github/workflows/cicd.yml`

**Files:**
- Create: `.github/workflows/cicd.yml`

**Current behavior:** no CI at all.
**New behavior:** `ci` job on GitHub-hosted `ubuntu-latest` for PRs and pushes to `main` (untrusted fork-PR code never touches the home server); `deploy` job on the self-hosted runner for pushes to `main` only, with Portainer secrets.

- [ ] Create `.github/workflows/cicd.yml`:

```yaml
name: cicd

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: cicd-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
        with:
          python-version: "3.14"
          enable-cache: true
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: make ci

  deploy:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: ci
    runs-on: [self-hosted, linux, midas]
    timeout-minutes: 30
    env:
      PORTAINER_URL: http://192.168.2.10:9000
      PORTAINER_API_TOKEN: ${{ secrets.PORTAINER_API_TOKEN }}
      PORTAINER_ENDPOINT_ID: ${{ secrets.PORTAINER_ENDPOINT_ID }}
    steps:
      - uses: actions/checkout@v4
      - run: make images
      - run: make deploy
```

- [ ] Push the branch and open a PR to `main`.
- [ ] Verify in GitHub Actions: the `ci` job runs on `ubuntu-latest` and is green (the `deploy` job must not run for PRs — confirm it is absent or skipped).

**DONE when:** a PR shows a green `ci` job and no deploy job.

---

### Task 5: Runner container definition

**Files:**
- Create: `deploy/Dockerfile`
- Create: `deploy/runner.yml`
- Modify: `.gitignore` (append `deploy/.env`)

**Current behavior:** the host runs four pre-existing `myoung34/github-runner` containers, all crash-looping (out of scope — but the new runner must not collide with them: distinct container name).
**New behavior:** a `midas-runner` container: the host's proven `myoung34` pattern (registration logic + docker CLI included) plus `make` + `node` — everything the deploy job needs.

- [ ] Create `deploy/Dockerfile`:

```dockerfile
FROM myoung34/github-runner:ubuntu-noble
RUN apt-get update && apt-get install -y --no-install-recommends make nodejs && rm -rf /var/lib/apt/lists/*
```

(Noble's `nodejs` is 18.x — has global `fetch`, sufficient for `portainer-deploy.mjs`.)

- [ ] Create `deploy/runner.yml`:

```yaml
services:
  midas-runner:
    build:
      context: .
      dockerfile: Dockerfile
    image: midas-runner
    container_name: midas-runner
    env_file: .env
    environment:
      GITHUB_RUNNER_LABELS: "midas,linux"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - runner-workspace:/__w
    restart: unless-stopped

volumes:
  runner-workspace:
```

- [ ] Append to `.gitignore`:

```
# One-time runner registration token — never commit
deploy/.env
```

- [ ] Verify the image builds (on the host via SSH, or locally with Docker):

```sh
docker build -t midas-runner deploy/
docker run --rm midas-runner sh -c 'make --version && node --version && docker version --format "{{.Client.Version}}"'
```

Expected: all three commands print versions (the last proves the docker CLI works; it will warn about no daemon — that is expected without the socket mount).

**DONE when:** the `midas-runner` image builds and the three tools answer inside it.

---

### Task 6: One-time live setup (host 192.168.2.10, via SSH `this@192.168.2.10`)

Interactive with the owner. Nothing here is code in the repo except `deploy/.env` (gitignored) and GitHub secrets.

- [ ] Owner: in Portainer (`http://192.168.2.10:9000`) create a user with stack permissions on the endpoint; generate its API token; note the endpoint ID.
- [ ] Owner: GitHub repo → Settings → Actions → Runners → New self-hosted runner (Linux) → copy the registration token.
- [ ] Builder on host: write `deploy/.env` (in the repo checkout on the host):

```
RUNNER_NAME=midas-runner
GITHUB_TOKEN=<registration token>
GITHUB_OWNER=nicolaslallier
GITHUB_REPO=Midas
```

- [ ] Builder on host: `docker compose -f deploy/runner.yml up -d` (from the repo directory; image builds first).
- [ ] Verify the runner is live:
  - `docker logs midas-runner` → registration succeeds, "Connected to GitHub"
  - Repo → Settings → Actions → Runners: `midas-runner` online, labels `midas, linux`
  - Inside the container: `docker exec midas-runner sh -c 'docker ps && curl -sf http://192.168.2.10:9000/api/status && make --version && node --version'` — all four must succeed (socket, Portainer reachability, toolchain).
- [ ] Verify the Portainer API shape against live 2.45.0 (spec requires this):

```sh
curl -s -H "Authorization: Bearer $PORTAINER_API_TOKEN" \
  "http://192.168.2.10:9000/api/stacks?endpointId=$PORTAINER_ENDPOINT_ID"
```

Confirm the list items expose `ID` and `Name` as `portainer-deploy.mjs` expects; if 2.45.0 differs, fix the script (Task 3) and re-run its `--dry-run` check.
- [ ] Owner: add repo secrets `PORTAINER_API_TOKEN` and `PORTAINER_ENDPOINT_ID`.

**DONE when:** runner is online in GitHub with the `midas` label, and all four in-container checks pass.

---

### Task 7: Merge + end-to-end deploy verification

- [ ] Merge `cicd/makefile` into `main`.
- [ ] Watch the workflow: `ci` green on `ubuntu-latest`, then `deploy` picks up on the `midas` runner and runs `make images` (three docker builds on the host engine) + `make deploy`.
- [ ] Verify in Portainer UI → Stacks: `midas` exists, three containers running.
- [ ] Verify from outside the LAN: `curl -s http://192.168.2.10:8080` returns the Vue app's HTML.
- [ ] Push a second (trivial) commit to `main` → verify the deploy job takes the **update** path (script logs `Updated stack "midas" (id …)`) and the three containers come back with the new tag — no duplicate stack, no manual steps.

**DONE when:** the spec's acceptance bar holds: runner online, cloud `make ci` green, real `make deploy` created the stack, frontend on `192.168.2.10:8080`, and a second push updated in place.

---

### Task 8: `docs/cicd.md` + `AGENTS.md` (second PR, after Task 7)

Docs are written from the live-verified reality of Tasks 6–7, not from assumptions.

**Files:**
- Create: `docs/cicd.md`
- Modify: `AGENTS.md`

- [ ] Create `docs/cicd.md` with these sections (Windows-host perspective throughout):
  1. **Architecture** — what runs where: repo → GitHub Actions → self-hosted `midas-runner` container on 192.168.2.10 → Docker engine + Portainer; nothing on the home server is internet-exposed.
  2. **One-time setup** — exactly what Task 6 did, reproducible from scratch: runner image build, `deploy/.env` contents, registration, Portainer user/token, endpoint ID, GitHub secrets.
  3. **Day-to-day** — push to main → auto-deploy; checking stack status in the Portainer UI; manual `make stack-up`/`stack-down`/`clean` from the runner or a Docker-capable machine.
  4. **Troubleshooting** — runner offline (restart container, check logs), token rotation + re-registration, deploy job failures (read `make deploy` output), port 8080 conflicts, and a note that the four pre-existing crash-looping runner containers are unrelated.
- [ ] Modify `AGENTS.md`:
  - **Status:** "Scaffold + CI/CD landed." — CI (`make ci`) on GitHub-hosted runners for PRs; deploys to the Portainer `midas` stack on the home server via the self-hosted `midas` runner.
  - **Canonical commands:** add a root section: `make ci` (quality gate) · `make images` · `make deploy` · `make stack-up` / `make stack-down` · `make clean`.
  - **To fill in:** remove the "CI workflow" line; keep pre-commit and the frontend test runner lines.

- [ ] Open the second PR; verify `make ci` is still green on it.

**DONE when:** `docs/cicd.md` describes the pipeline as it actually runs, and AGENTS.md's to-fill-in list no longer includes CI.
