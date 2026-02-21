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



test('GET /api/runs paginates Strava activities and includes only AlpineSki entries', async () => {
  const responses = [
    [
      {
        id: 600,
        name: 'Morning Ride',
        distance: 9000,
        moving_time: 1800,
        total_elevation_gain: 300,
        sport_type: 'Ride',
        start_date_local: '2026-01-03T08:00:00Z'
      }
    ],
    [
      {
        id: 601,
        name: 'Legacy Ski Day',
        distance: 5000,
        moving_time: 2000,
        total_elevation_gain: 480,
        type: 'Ski',
        start_date_local: '2026-01-03T09:00:00Z'
      },
      {
        id: 602,
        name: 'Alpine Session',
        distance: 6200,
        moving_time: 2100,
        total_elevation_gain: 530,
        sport_type: 'AlpineSki',
        start_date_local: '2026-01-03T10:00:00Z'
      }
    ]
  ];

  const stravaFetch = async () => {
    const payload = responses.shift() ?? [];
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

      const { status, body } = await requestJson(baseUrl, '/api/runs');
      assert.equal(status, 200);
      assert.equal(body.runs.length, 1);
      assert.equal(body.runs[0].id, 'strava-602');
      assert.equal(body.runs[0].source, 'strava');
    },
    { stravaFetch, stravaPageSize: 1 }
  );
});

test('GET /api/runs/:id/track returns Strava stream track for connected user', async () => {
  const responses = [
    {
      id: 101,
      name: 'Morning Groomers',
      distance: 12450,
      moving_time: 3180,
      total_elevation_gain: 510,
      sport_type: 'AlpineSki',
      start_date: '2026-01-03T08:00:00Z'
    },
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


test('GET /auth/strava/callback redirects with Strava provider error details', async () => {
  await withConfiguredServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth/strava/callback?error=access_denied`, {
      redirect: 'manual'
    });

    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/?strava=denied&strava_reason=access_denied');
  });
});

test('GET /auth/strava/callback redirects with token exchange failure details', async () => {
  const stravaFetch = async () => ({
    ok: false,
    status: 400,
    async json() {
      return { message: 'invalid client secret' };
    }
  });

  await withConfiguredServer(
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/auth/strava/callback?code=bad-code`, { redirect: 'manual' });
      assert.equal(response.status, 302);
      assert.equal(
        response.headers.get('location'),
        '/?strava=auth-error&strava_reason=invalid%20client%20secret'
      );
    },
    { stravaFetch }
  );
});

test('GET /api/runs returns empty run list when connected user has no winter activities', async () => {
  const stravaFetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return [
        {
          id: 700,
          name: 'City Ride',
          distance: 21000,
          moving_time: 3200,
          total_elevation_gain: 120,
          sport_type: 'Ride',
          start_date_local: '2026-02-01T08:00:00Z'
        }
      ];
    }
  });

  await withConfiguredServer(
    async (baseUrl, tokenStore) => {
      tokenStore.set({
        access_token: 'token-1',
        refresh_token: 'refresh-1',
        expires_at: 9999999999,
        athlete: { username: 'ski-user' }
      });

      const { body } = await requestJson(baseUrl, '/api/runs');
      assert.equal(body.mode, 'strava');
      assert.equal(body.totalActivities, 1);
      assert.deepEqual(body.runs, []);
    },
    { stravaFetch }
  );
});

test('GET /api/activities returns only AlpineSki activities', async () => {
  const stravaFetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return [
        {
          id: 701,
          name: 'Lunch Nordic',
          distance: 11000,
          moving_time: 2800,
          total_elevation_gain: 430,
          sport_type: 'NordicSki',
          start_date_local: '2026-02-01T12:00:00Z'
        },
        {
          id: 702,
          name: 'Afternoon Laps',
          distance: 8200,
          moving_time: 2600,
          total_elevation_gain: 690,
          sport_type: 'AlpineSki',
          start_date_local: '2026-02-01T14:00:00Z'
        }
      ];
    }
  });

  await withConfiguredServer(
    async (baseUrl, tokenStore) => {
      tokenStore.set({
        access_token: 'token-1',
        refresh_token: 'refresh-1',
        expires_at: 9999999999,
        athlete: { username: 'ski-user' }
      });

      const { body } = await requestJson(baseUrl, '/api/activities');
      assert.equal(body.mode, 'strava');
      assert.equal(body.activities.length, 1);
      assert.equal(body.activities[0].sportType, 'AlpineSki');
      assert.equal(body.activities[0].id, 'strava-702');
    },
    { stravaFetch }
  );
});


test('GET /api/alpine/days loads all paginated alpine days for selected year', async () => {
  const responses = [
    [
      {
        id: 801,
        name: 'Day One',
        distance: 7000,
        moving_time: 2100,
        total_elevation_gain: 500,
        sport_type: 'AlpineSki',
        start_date_local: '2026-02-01T09:00:00Z'
      }
    ],
    [
      {
        id: 802,
        name: 'Day Two',
        distance: 6800,
        moving_time: 2050,
        total_elevation_gain: 480,
        sport_type: 'AlpineSki',
        start_date_local: '2026-01-31T09:00:00Z'
      }
    ],
    []
  ];

  const stravaFetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return responses.shift() ?? [];
    }
  });

  await withConfiguredServer(
    async (baseUrl, tokenStore) => {
      tokenStore.set({
        access_token: 'token-1',
        refresh_token: 'refresh-1',
        expires_at: 9999999999,
        athlete: { username: 'ski-user' }
      });

      const { status, body } = await requestJson(baseUrl, '/api/alpine/days?year=2026');
      assert.equal(status, 200);
      assert.deepEqual(body.days.map((item) => item.day), ['2026-02-01', '2026-01-31']);
    },
    { stravaFetch, stravaPageSize: 1 }
  );
});

test('GET /api/alpine/runs returns runs for selected day', async () => {
  const stravaFetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return [
        {
          id: 901,
          name: 'Lunch Laps',
          distance: 5400,
          moving_time: 1700,
          total_elevation_gain: 620,
          sport_type: 'AlpineSki',
          start_date_local: '2026-02-03T12:00:00Z'
        }
      ];
    }
  });

  await withConfiguredServer(
    async (baseUrl, tokenStore) => {
      tokenStore.set({
        access_token: 'token-1',
        refresh_token: 'refresh-1',
        expires_at: 9999999999,
        athlete: { username: 'ski-user' }
      });

      const { status, body } = await requestJson(baseUrl, '/api/alpine/runs?day=2026-02-03');
      assert.equal(status, 200);
      assert.equal(body.runs.length, 1);
      assert.equal(body.runs[0].id, 'strava-901');
    },
    { stravaFetch }
  );
});
