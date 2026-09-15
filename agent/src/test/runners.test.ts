import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadConfig } from '../config.js';
import { dockerRunArgs, prepareSessionCodexHome, SOURCE_MOUNT } from '../runners.js';

test('a session container sees the source read-only, with activity logs and bulk covered up', () => {
  const source = mkdtempSync(join(tmpdir(), 'kidraw-source-'));
  try {
    mkdirSync(join(source, 'node_modules'));
    mkdirSync(join(source, 'tools'));
    writeFileSync(join(source, 'tools', 'debug.log'), 'keystrokes');
    const shared = dockerRunArgs(
      loadConfig({ KIDRAW_AGENT_RUNNER: 'docker', KIDRAW_AGENT_SOURCE_DIR: source }), 'c1', '/tmp/home');
    const joined = shared.join(' ');
    assert.ok(joined.includes(`-v ${source}:${SOURCE_MOUNT}:ro`), joined);
    assert.ok(joined.includes(`-v /dev/null:${SOURCE_MOUNT}/tools/debug.log:ro`), joined);
    assert.ok(joined.includes(`--mount type=tmpfs,destination=${SOURCE_MOUNT}/node_modules`), joined);
    // Nothing is mounted for paths that don't exist (e.g. no draft mirror here).
    assert.ok(!joined.includes('draft-mirror.json'), joined);
    assert.equal(shared[shared.length - 1], 'kidraw-agent-codex:latest');

    const unshared = dockerRunArgs(loadConfig({ KIDRAW_AGENT_RUNNER: 'docker' }), 'c2', '/tmp/home').join(' ');
    assert.ok(!unshared.includes(SOURCE_MOUNT), unshared);
  } finally {
    rmSync(source, { recursive: true, force: true });
  }
});

function codexHomeWithLogin(login: string) {
  const root = mkdtempSync(join(tmpdir(), 'kidraw-codex-home-'));
  const codexHome = join(root, 'codex');
  mkdirSync(codexHome);
  writeFileSync(join(codexHome, 'auth.json'), login);
  return { root, codexHome, config: { ...loadConfig({}), codexHome } };
}

test('a session home holds only a copy of the login and the restrictive config', () => {
  const { root, config } = codexHomeWithLogin('{"token":"a"}');
  try {
    const home = prepareSessionCodexHome(config, 's1');
    assert.equal(readFileSync(join(home.dir, 'auth.json'), 'utf8'), '{"token":"a"}');
    const toml = readFileSync(join(home.dir, 'config.toml'), 'utf8');
    assert.match(toml, /^web_search = "disabled"$/m);
    assert.match(toml, /^\[history\]\npersistence = "none"$/m);
    assert.match(toml, /^\[features\]\nmemories = false$/m);
    home.finish();
    assert.equal(existsSync(home.dir), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a login refreshed during the session is copied back when it ends', () => {
  const { root, codexHome, config } = codexHomeWithLogin('{"token":"old"}');
  try {
    const home = prepareSessionCodexHome(config, 's2');
    const sessionAuth = join(home.dir, 'auth.json');
    writeFileSync(sessionAuth, '{"token":"new"}');
    const later = new Date(Date.now() + 60_000);
    utimesSync(sessionAuth, later, later);
    home.finish();
    home.finish(); // safe twice
    assert.equal(readFileSync(join(codexHome, 'auth.json'), 'utf8'), '{"token":"new"}');
    assert.equal(existsSync(home.dir), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a newer login written by another session is not overwritten by a stale copy', () => {
  const { root, codexHome, config } = codexHomeWithLogin('{"token":"old"}');
  try {
    const home = prepareSessionCodexHome(config, 's3');
    const earlier = new Date(Date.now() - 60_000);
    utimesSync(join(home.dir, 'auth.json'), earlier, earlier);
    writeFileSync(join(codexHome, 'auth.json'), '{"token":"from-another-session"}');
    home.finish();
    assert.equal(readFileSync(join(codexHome, 'auth.json'), 'utf8'), '{"token":"from-another-session"}');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
