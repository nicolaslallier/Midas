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

if (!token) {
  console.error('PORTAINER_API_TOKEN is required');
  process.exit(1);
}
if (!endpointId) {
  console.error('PORTAINER_ENDPOINT_ID is required');
  process.exit(1);
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
    body: JSON.stringify({
      Name: name,
      EndpointId: Number(endpointId),
      ComposeFile: compose,
      Prune: false,
    }),
  });
  console.log(`Created stack "${name}" (id ${created?.ID ?? '?'}) with tag ${tag}`);
}
