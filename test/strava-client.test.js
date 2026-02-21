import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildAuthorizeUrl, mapActivitiesToAnimationRuns } from '../src/lib/stravaClient.js';

const activitiesFixturePath = new URL('./fixtures/strava-activities.fixture.json', import.meta.url);

test('mapActivitiesToAnimationRuns keeps only ski activities and maps fields deterministically', async () => {
  const activities = JSON.parse(await readFile(activitiesFixturePath, 'utf8'));
  const runs = mapActivitiesToAnimationRuns(activities);

  assert.equal(runs.length, 2);
  assert.deepEqual(runs.map((run) => run.id), ['strava-101', 'strava-102']);
  assert.equal(runs[0].distanceKm, 12.45);
  assert.equal(runs[0].difficulty, 'blue');
  assert.equal(runs[1].difficulty, 'black');
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
