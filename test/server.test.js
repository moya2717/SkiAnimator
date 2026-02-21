import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFixtureStore } from '../src/lib/dataStore.js';
import { createAppServer } from '../src/server.js';
import { createTokenStore } from '../src/lib/tokenStore.js';

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

async function withConfiguredServer(run, serverOptions = {}) {
  const store = createFixtureStore({ baseDir: localFixtureDir.pathname });
  const tokenStore = createTokenStore();
  const server = createAppServer(store, {
    stravaConfig: { clientId: 'id-1', clientSecret: 'secret-1' },
    tokenStore,
    ...serverOptions
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    await run(`http://127.0.0.1:${port}`, tokenStore);
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

test('GET /api/strava/status returns disconnected state when not configured', async () => {
  await withServer(async (baseUrl) => {
    const { status, body } = await requestJson(baseUrl, '/api/strava/status');
    assert.equal(status, 200);
    assert.equal(body.configured, false);
    assert.equal(body.connected, false);
  });
});

test('GET /api/strava/status returns connected state when token exists', async () => {
  await withConfiguredServer(async (baseUrl, tokenStore) => {
    tokenStore.set({
      access_token: 'token-1',
      refresh_token: 'refresh-1',
      expires_at: 9999999999,
      athlete: { username: 'ski-user' }
    });

    const { status, body } = await requestJson(baseUrl, '/api/strava/status');
    assert.equal(status, 200);
    assert.equal(body.configured, true);
    assert.equal(body.connected, true);
    assert.equal(body.athlete.username, 'ski-user');
  });
});


test('GET /api/runs/:id/track returns Strava stream track for connected user', async () => {
  const responses = [
    [
      {
        id: 101,
        name: 'Morning Groomers',
        distance: 12450,
        moving_time: 3180,
        total_elevation_gain: 510,
        sport_type: 'AlpineSki',
        start_date: '2026-01-03T08:00:00Z'
      }
    ],
    {
      latlng: { data: [[46.1, 7.2], [46.09, 7.21]] },
      altitude: { data: [2488.8, 2412.2] },
      time: { data: [0, 95] }
    }
  ];

  const stravaFetch = async () => {
    const payload = responses.shift();
    return {
      ok: true,
      status: 200,
      async json() {
        return payload;
      }
    };
  };

  await withConfiguredServer(
    async (baseUrl, tokenStore) => {
      tokenStore.set({
        access_token: 'token-1',
        refresh_token: 'refresh-1',
        expires_at: 9999999999,
        athlete: { username: 'ski-user' }
      });

      const { status, body } = await requestJson(baseUrl, '/api/runs/strava-101/track');
      assert.equal(status, 200);
      assert.equal(body.runId, 'strava-101');
      assert.equal(body.source, 'strava');
      assert.equal(body.points.length, 2);
      assert.equal(body.points[1].timestamp, '2026-01-03T08:01:35.000Z');
    },
    { stravaFetch }
  );
});
