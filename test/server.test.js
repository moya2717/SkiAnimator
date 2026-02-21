import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFixtureStore } from '../src/lib/dataStore.js';
import { createAppServer } from '../src/server.js';

const rootFixturePath = new URL('../src/data/runs.fixture.json', import.meta.url);
const localFixtureDir = new URL('./fixtures/', import.meta.url);

async function withServer(run) {
  const store = createFixtureStore({ baseDir: localFixtureDir.pathname });
  const server = createAppServer(store);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

async function requestJson(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  const body = await response.json();
  return { status: response.status, body };
}

test('fixture has deterministic run data', async () => {
  const raw = await readFile(rootFixturePath, 'utf8');
  const data = JSON.parse(raw);

  assert.equal(data.resort, 'Alpine Ridge');
  assert.equal(data.runs.length, 3);
  assert.deepEqual(data.runs.map((run) => run.name), ['Summit Line', 'Pine Traverse', 'Valley Cruiser']);
});

test('GET /api/ski-days returns deterministic local fixtures', async () => {
  await withServer(async (baseUrl) => {
    const { status, body } = await requestJson(baseUrl, '/api/ski-days');
    assert.equal(status, 200);
    assert.equal(body.length, 2);
    assert.deepEqual(body.map((day) => day.id), ['day-a', 'day-b']);
  });
});

test('GET /api/ski-days/:id/runs returns fixture runs and 404 for unknown day', async () => {
  await withServer(async (baseUrl) => {
    const found = await requestJson(baseUrl, '/api/ski-days/day-a/runs');
    assert.equal(found.status, 200);
    assert.deepEqual(found.body.map((run) => run.id), ['run-a1', 'run-a2']);

    const missing = await requestJson(baseUrl, '/api/ski-days/day-z/runs');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, 'Ski day not found');
  });
});

test('GET /api/runs/:id/track returns deterministic track and 404 for unknown run', async () => {
  await withServer(async (baseUrl) => {
    const found = await requestJson(baseUrl, '/api/runs/run-a1/track');
    assert.equal(found.status, 200);
    assert.equal(found.body.runId, 'run-a1');
    assert.equal(found.body.points.length, 2);

    const missing = await requestJson(baseUrl, '/api/runs/run-z9/track');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, 'Run track not found');
  });
});
