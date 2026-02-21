import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchAthleteActivities,
  mapActivitiesToAnimationRuns,
  mapActivityStreamsToTrack
} from '../src/lib/stravaClient.js';

const activitiesFixturePath = new URL('./fixtures/strava-activities.fixture.json', import.meta.url);

test('mapActivitiesToAnimationRuns keeps only AlpineSki activities and maps fields deterministically', async () => {
  const activities = JSON.parse(await readFile(activitiesFixturePath, 'utf8'));
  const runs = mapActivitiesToAnimationRuns(activities);

  assert.equal(runs.length, 1);
  assert.deepEqual(runs.map((run) => run.id), ['strava-101']);
  assert.equal(runs[0].distanceKm, 12.45);
  assert.equal(runs[0].difficulty, 'blue');
});


test('mapActivitiesToAnimationRuns includes legacy Ski type and rejects non-ski sports', () => {
  const runs = mapActivitiesToAnimationRuns([
    {
      id: 201,
      name: 'Legacy Ski Activity',
      type: 'Ski',
      distance: 2100,
      moving_time: 900,
      total_elevation_gain: 200,
      start_date_local: '2026-01-03T08:00:00Z'
    },
    {
      id: 202,
      name: 'Case Variant Snowboard',
      sport_type: 'snowBoard',
      distance: 2500,
      moving_time: 1000,
      total_elevation_gain: 500,
      start_date_local: '2026-01-03T09:00:00Z'
    }
  ]);

  assert.deepEqual(runs.map((run) => run.id), ['strava-201']);
});

test('buildAuthorizeUrl includes required oauth fields', () => {
  const url = new URL(
    buildAuthorizeUrl({
      clientId: '123',
      redirectUri: 'http://localhost:3000/auth/strava/callback',
      state: 'state-1'
    })
  );

  assert.equal(url.origin + url.pathname, 'https://www.strava.com/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), '123');
  assert.equal(url.searchParams.get('scope'), 'read,activity:read_all');
  assert.equal(url.searchParams.get('state'), 'state-1');
});


test('mapActivityStreamsToTrack maps lat/lon, altitude and timestamps', () => {
  const activity = { id: 77, start_date: '2026-01-03T08:00:00Z' };
  const streams = {
    latlng: { data: [[46.1, 7.2], [46.09, 7.21]] },
    altitude: { data: [2488.8, 2412.2] },
    time: { data: [0, 95] }
  };

  const track = mapActivityStreamsToTrack(activity, streams);

  assert.equal(track.runId, 'strava-77');
  assert.equal(track.source, 'strava');
  assert.equal(track.points.length, 2);
  assert.deepEqual(track.points[0], {
    lat: 46.1,
    lon: 7.2,
    elevationM: 2489,
    timestamp: '2026-01-03T08:00:00.000Z'
  });
  assert.deepEqual(track.points[1], {
    lat: 46.09,
    lon: 7.21,
    elevationM: 2412,
    timestamp: '2026-01-03T08:01:35.000Z'
  });
});


test('exchangeCodeForToken includes redirect URI in token request payload', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      async json() {
        return { access_token: 'token-1', refresh_token: 'refresh-1', expires_at: 9999 };
      }
    };
  };

  await exchangeCodeForToken({
    code: 'auth-code',
    clientId: '123',
    clientSecret: 'secret',
    redirectUri: 'http://localhost:3000/auth/strava/callback',
    fetchImpl: fetchMock
  });

  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.redirect_uri, 'http://localhost:3000/auth/strava/callback');
  assert.equal(body.code, 'auth-code');
});


test('fetchAthleteActivities forwards optional before/after range query', async () => {
  const calls = [];
  const fetchMock = async (url) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      async json() {
        return [];
      }
    };
  };

  await fetchAthleteActivities({
    accessToken: 'token-1',
    perPage: 50,
    page: 2,
    before: 200,
    after: 100,
    fetchImpl: fetchMock
  });

  const url = new URL(calls[0]);
  assert.equal(url.searchParams.get('per_page'), '50');
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.get('before'), '200');
  assert.equal(url.searchParams.get('after'), '100');
});
