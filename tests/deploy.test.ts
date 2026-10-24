// The deployment files (Phase 9, D-37): what they must keep true whoever edits them. The EC2 secrets sync is run for
// real against a stand-in `aws` command; the Kubernetes manifests and Compose overlays are read as text (CI also
// builds them with kustomize and validates them with kubeconform and `docker compose config`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { envSchema } from '../lib/server/env.ts';

const repo = new URL('..', import.meta.url).pathname;
const read = (p: string) => readFileSync(join(repo, p), 'utf8');
const K8S = 'deploy/k8s/base';
const schemaKeys = Object.keys(envSchema.shape);

/* ─── The EC2 secrets sync (deploy/ec2/sync-secrets.sh) ─── */

const SECRET = { SESSION_SECRET: 'sync-test-session-secret-0123456789abcdef', DEMANDAI_OWNER_PASSWORD: 'sync-test-owner-pw', DEMANDAI_APP_PASSWORD: 'sync-test-app-pw',
  DEMANDAI_OPS_PASSWORD: 'sync-test-ops-pw', AZURE_OPENAI_API_KEY: 'sync-test-azure-key', lowercase_key: 'ignored', MULTI_LINE: 'a\nb' };

function sync(secret: Record<string, string>, settings: string) {
  const dir = mkdtempSync(join(tmpdir(), 'sync-')), bin = join(dir, 'bin');
  spawnSync('mkdir', [bin]);
  writeFileSync(join(dir, 'settings.env'), settings);
  // The stand-in answers like `aws secretsmanager get-secret-value --query SecretString --output text`.
  writeFileSync(join(dir, 'secret.json'), JSON.stringify(secret));
  writeFileSync(join(bin, 'aws'), `#!/bin/sh\ncat "${join(dir, 'secret.json')}"\n`);
  chmodSync(join(bin, 'aws'), 0o755);
  const r = spawnSync('bash', [join(repo, 'deploy/ec2/sync-secrets.sh')], { encoding: 'utf8',
    env: { PATH: `${bin}:${process.env.PATH}`, DEMANDAI_ETC: dir, DEMANDAI_SECRET_ID: 'demandai/pilot/ec2' } });
  return { dir, r, out: join(dir, 'demandai.env') };
}

test('the EC2 secrets sync writes one owner-only env file from the settings and the secret, and prints no value', () => {
  const { dir, r, out } = sync(SECRET, '# settings\nAPP_BASE_URL=https://demandai.example.com\nDEMANDAI_IMAGE=ghcr.io/x/demandai-app@sha256:abc\nPOSTGRES_DB=demandai\nRDS_HOST=db.example.com\n');
  try {
    assert.equal(r.status, 0, r.stderr);
    assert.equal(statSync(out).mode & 0o777, 0o600);
    const env = readFileSync(out, 'utf8');
    for (const k of ['APP_BASE_URL', 'DEMANDAI_IMAGE', 'SESSION_SECRET', 'DEMANDAI_APP_PASSWORD', 'AZURE_OPENAI_API_KEY']) assert.match(env, new RegExp(`^${k}=.+`, 'm'), k);
    assert.match(env, /^POSTGRES_PASSWORD=unused-with-rds$/m, 'with RDS the unused local superuser variables are filled in');
    assert.doesNotMatch(env, /lowercase_key|MULTI_LINE/, 'only variable names, one line each');
    for (const v of Object.values(SECRET)) assert.ok(!r.stdout.includes(v) && !r.stderr.includes(v), 'no value printed');
    assert.deepEqual(readdirSync(dir).filter(f => f.startsWith('.demandai.env')), [], 'no temporary file left');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the EC2 secrets sync refuses to write when a required secret is missing, naming it but not the others\' values', () => {
  const { SESSION_SECRET: _drop, ...rest } = SECRET;
  void _drop;
  const { dir, r, out } = sync(rest, 'APP_BASE_URL=https://demandai.example.com\nDEMANDAI_IMAGE=x\nPOSTGRES_DB=demandai\n');
  try {
    assert.equal(r.status, 1);
    assert.match(r.stderr, /SESSION_SECRET is not set/);
    assert.equal(existsSync(out), false, 'the previous env file (if any) stays as it was');
    for (const v of Object.values(rest)) assert.ok(!r.stderr.includes(v));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/* ─── Kubernetes (deploy/k8s) ─── */

test('Kubernetes: every setting and secret named is one the app reads; production\'s required ones are there', () => {
  const config = read(`${K8S}/configmap.yaml`), secrets = read(`${K8S}/externalsecrets.yaml`);
  const configKeys = [...config.matchAll(/^ {2}([A-Z][A-Z0-9_]*):/gm)].map(m => m[1]);
  const secretKeys = [...secrets.matchAll(/secretKey: ([A-Z][A-Z0-9_]*)/g)].map(m => m[1]);
  assert.deepEqual([...configKeys, ...secretKeys].filter(k => !schemaKeys.includes(k)), [], 'unknown to lib/server/env.ts');
  for (const k of ['APP_BASE_URL', 'DATABASE_URL', 'SESSION_SECRET']) assert.ok(configKeys.includes(k) || secretKeys.includes(k), k);
  assert.ok(!configKeys.some(k => /SECRET|PASSWORD|API_KEY|DATABASE_.*URL/.test(k)), 'no secret in the ConfigMap');
  for (const k of ['AI_FEATURE_CLASSIFY', 'AI_FEATURE_WHY_NOW', 'AI_FEATURE_DRAFTING', 'AI_FEATURE_CONTENT_STUDIO', 'AI_FEATURE_COPILOT']) assert.match(config, new RegExp(`${k}: "0"`), `${k} off`);
  assert.match(config, /AZURE_OPENAI_API_VERSION: 2025-04-01-preview/);
});

test('Kubernetes: the app never holds the owner or ops credentials; the migrate Job and the purge get only their own', () => {
  const docs = read(`${K8S}/externalsecrets.yaml`).split(/^---$/m);
  const keysOf = (name: string) => [...docs.find(d => new RegExp(`name: ${name}\\n`).test(d))!.matchAll(/secretKey: (\w+)/g)].map(m => m[1]);
  assert.deepEqual(keysOf('demandai-app').filter(k => /MIGRATION|OPS/.test(k)), []);
  assert.deepEqual(keysOf('demandai-migrate'), ['DATABASE_MIGRATION_URL']);
  assert.deepEqual(keysOf('demandai-ops'), ['DATABASE_OPS_URL']);
  assert.match(read(`${K8S}/deployment.yaml`), /secretRef: \{ name: demandai-app \}/);
  assert.match(read(`${K8S}/migrate-job.yaml`), /secretRef: \{ name: demandai-migrate \}/);
  assert.match(read(`${K8S}/purge-cronjob.yaml`), /secretRef: \{ name: demandai-ops \}/);
});

test('Kubernetes: every pod is non-root with a read-only root filesystem, no privilege escalation and no capabilities', () => {
  for (const f of ['deployment.yaml', 'migrate-job.yaml', 'purge-cronjob.yaml', '../jobs/create-admin.yaml']) {
    const y = read(`${K8S}/${f}`);
    for (const re of [/runAsNonRoot: true/, /runAsUser: 10001/, /readOnlyRootFilesystem: true/, /allowPrivilegeEscalation: false/, /drop: \["ALL"\]/, /seccompProfile: \{ type: RuntimeDefault \}/, /automountServiceAccountToken: false/]) {
      assert.match(y, re, `${f}: ${re}`);
    }
  }
  const app = read(`${K8S}/deployment.yaml`);
  assert.match(app, /readinessProbe:\s+httpGet: \{ path: \/api\/ready/);
  assert.match(app, /livenessProbe:\s+httpGet: \{ path: \/api\/health/);
  assert.match(app, /mountPath: \/app\/\.next\/cache/, 'Next\'s cache is the one writable app folder');
  assert.match(read('deploy/k8s/overlays/pilot/namespace.yaml'), /pod-security\.kubernetes\.io\/enforce: restricted/);
});

test('Kubernetes: the purge is a dry run until the overlay adds --yes; the app is reached only through the ALB', () => {
  assert.match(read(`${K8S}/purge-cronjob.yaml`), /command: \["node", "scripts\/data\/purge\.mjs", "--due"\]/);
  assert.doesNotMatch(read(`${K8S}/purge-cronjob.yaml`), /--yes"/);
  assert.match(read(`${K8S}/service.yaml`), /type: ClusterIP/);
  assert.match(read(`${K8S}/configmap.yaml`), /TRUSTED_PROXY_HOPS: "1"/);
  assert.match(read(`${K8S}/ingress.yaml`), /ingressClassName: alb/);
  assert.match(read('deploy/k8s/overlays/pilot/kustomization.yaml'), /digest: sha256:/, 'the release is pinned by digest');
});

/* ─── EC2 Compose overlays ─── */

test('EC2: Caddy pinned by digest is the only public listener; RDS is reached over verified TLS with the role passwords', () => {
  const proxy = read('deploy/ec2/compose.proxy.yaml'), rds = read('deploy/ec2/compose.rds.yaml'), base = read('compose.yaml');
  assert.match(proxy, /image: caddy:[\w.-]+@sha256:[0-9a-f]{64}/);
  assert.match(proxy, /TRUSTED_PROXY_HOPS: "1"/);
  assert.match(base, /- "127\.0\.0\.1:\$\{APP_PORT:-3100\}:3000"/, 'the app listens on loopback only');
  assert.match(base, /read_only: true[\s\S]*cap_drop: \[ALL\]/);
  for (const role of ['demandai_app', 'demandai_owner', 'demandai_ops']) assert.match(rds, new RegExp(`postgresql://${role}:\\$\\{DEMANDAI_\\w+_PASSWORD:\\?\\}@\\$\\{RDS_HOST:\\?\\}`));
  assert.equal((rds.match(/DATABASE_SSL_MODE: verify-full/g) ?? []).length, 2);
});
