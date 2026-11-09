import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { SAMPLE } from '../src/sample.mjs';
import { MAX_JSON_BYTES } from '../src/import.mjs';
import { auditDecision, auditSensitivity } from '../src/decision.mjs';
import { buildDecisionSheet } from '../src/report.mjs';

const cwd = new URL('..', import.meta.url);
const cli = (args = [], preload) => {
  const result = spawnSync(process.execPath, [
    ...(preload ? ['--import', preload] : []), 'scripts/decision-sheet.mjs', ...args
  ], { cwd, encoding: 'utf8', timeout: 10000, maxBuffer: 2 * MAX_JSON_BYTES });
  assert.equal(result.error, undefined);
  return result;
};
const expected = scenario => buildDecisionSheet(auditDecision(scenario), auditSensitivity(scenario)) + '\n';
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'openreturn-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
function refused(result, diagnostic) {
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, diagnostic);
}
test('CLI sample and UTF-8 file produce exact report bytes', async t => {
  assert.equal(cli().stdout, expected(SAMPLE));
  const dir = await fixture(t);
  const scenario = { ...SAMPLE, title: 'Pantry café 東京 🥕 \ufffd' };
  const path = join(dir, 'valid.json');
  await writeFile(path, JSON.stringify(scenario));
  const result = cli([path]);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, expected(scenario));
});
test('CLI refuses malformed UTF-8 rather than replacing source bytes', async t => {
  const dir = await fixture(t);
  for (const [name, bytes] of [
    ['invalid-leading', [0xff]], ['truncated', [0xe2, 0x82]],
    ['overlong', [0xc0, 0xaf]], ['surrogate', [0xed, 0xa0, 0x80]],
    ['out-of-range', [0xf4, 0x90, 0x80, 0x80]], ['bad-continuation', [0xe2, 0x28, 0xa1]]
  ]) {
    const source = JSON.stringify({ ...SAMPLE, title: 'MARKER' }).split('MARKER');
    const path = join(dir, name + '.json');
    await writeFile(path, Buffer.concat([Buffer.from(source[0]), Buffer.from(bytes), Buffer.from(source[1])]));
    refused(cli([path]), /valid UTF-8 bytes/);
  }
});
test('CLI uses raw byte cap, accepts the exact boundary, and preserves JSON BOM rejection', async t => {
  const dir = await fixture(t);
  const source = Buffer.from(JSON.stringify({ ...SAMPLE, title: 'é 東京 🥕' }));
  const path = join(dir, 'boundary.json');
  const boundary = Buffer.concat([source, Buffer.alloc(MAX_JSON_BYTES - source.length, 32)]);
  await writeFile(path, boundary);
  const result = cli([path]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, expected({ ...SAMPLE, title: 'é 東京 🥕' }));
  await writeFile(path, Buffer.concat([boundary, Buffer.from(' ')]));
  refused(cli([path]), /limit is 4,000,000 UTF-8 bytes/);
  await writeFile(path, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), source]));
  refused(cli([path]), /not valid JSON/);
  await writeFile(path, '');
  refused(cli([path]), /Paste a scenario/);
  await writeFile(path, '{secretInvalidJson');
  const bad = cli([path]);
  refused(bad, /not valid JSON/);
  assert.doesNotMatch(bad.stderr, /secretInvalidJson/);
});
test('CLI rejects missing, directory, symlink and special-file input without stdout or blocking', async t => {
  const dir = await fixture(t);
  refused(cli([join(dir, 'absent')]), /ENOENT/);
  const directory = join(dir, 'directory');
  await mkdir(directory);
  refused(cli([directory]), /regular file/);
  if (process.platform !== 'win32') {
    const normal = join(dir, 'normal.json');
    await writeFile(normal, JSON.stringify(SAMPLE));
    const link = join(dir, 'link.json');
    await symlink(normal, link);
    refused(cli([link]), /regular file/);
    const fifo = join(dir, 'fifo');
    const mkfifo = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
    assert.equal(mkfifo.status, 0, mkfifo.stderr);
    refused(cli([fifo]), /regular file/);
    refused(cli(['/dev/null']), /regular file/);
  }
});

// Instrument real file handles in child processes, never production entry points.
// This deterministically exercises growth/partial reads without timing races.
test('CLI caps reads after growth, handles partial reads, and closes failed reads', async t => {
  const dir = await fixture(t);
  const path = join(dir, 'source.json');
  await writeFile(path, JSON.stringify(SAMPLE));
  for (const mode of ['partial', 'grow', 'failure', 'oversized-stat']) {
    const preload = join(dir, mode + '.mjs');
    await writeFile(preload, `
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
const original = fs.open;
let reads = 0, total = 0, closed = false;
fs.open = async (...args) => {
  const handle = await original(...args);
  const read = handle.read.bind(handle), stat = handle.stat.bind(handle), close = handle.close.bind(handle);
  let stats = 0;
  handle.stat = async () => {
    const info = await stat();
    stats++;
    if ('${mode}' === 'oversized-stat') info.size = 4000001;
    if ('${mode}' === 'grow' && stats === 1) {
      await fs.appendFile(args[0], Buffer.alloc(4000001, 32));
    }
    return info;
  };
  handle.read = async (buffer, offset, length, position) => {
    reads++;
    if ('${mode}' === 'failure') throw new Error('simulated read failure');
    const result = await read(buffer, offset, Math.min(length, 127), position);
    total += result.bytesRead;
    return result;
  };
  handle.close = async () => { closed = true; return close(); };
  return handle;
};
syncBuiltinESMExports();
process.on('exit', () => {
  if (!closed || total > 4000001 || ('${mode}' === 'oversized-stat' && reads !== 0)) process.exitCode = 97;
});
`);
    const result = cli([path], preload);
    if (mode === 'partial') {
      assert.equal(result.status, 0);
      assert.equal(result.stdout, expected(SAMPLE));
    } else {
      refused(result, mode === 'failure' ? /simulated read failure/ : /limit is 4,000,000 UTF-8 bytes/);
    }
    await writeFile(path, JSON.stringify(SAMPLE));
  }
});
