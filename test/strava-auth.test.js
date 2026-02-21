import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { refreshStravaToken } from '../src/lib/stravaAuth.js';

const successFixturePath = new URL('./fixtures/strava-refresh-success.fixture.json', import.meta.url);
const errorFixturePath = new URL('./fixtures/strava-refresh-error.fixture.json', import.meta.url);

test('refreshStravaToken maps successful Strava token refresh response', async () => {
  const successBody = JSON.parse(await readFile(successFixturePath, 'utf8'));
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      async json() {
        return successBody;
      }
    };
  };

  const token = await refreshStravaToken({
    refreshToken: 'old-refresh-token',
    clientId: '12345',
    clientSecret: 'shh',
    fetchImpl: fetchMock
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://www.strava.com/oauth/token');
  assert.equal(token.accessToken, 'new-access-token');
  assert.equal(token.refreshToken, 'new-refresh-token');
});

test('refreshStravaToken surfaces Strava error payload on failed refresh', async () => {
  const errorBody = JSON.parse(await readFile(errorFixturePath, 'utf8'));
  const fetchMock = async () => ({
    ok: false,
    status: 400,
    async json() {
      return errorBody;
    }
  });

  await assert.rejects(
    () =>
      refreshStravaToken({
        refreshToken: 'bad-token',
        clientId: '12345',
        clientSecret: 'bad-secret',
        fetchImpl: fetchMock
      }),
    (error) => {
      assert.equal(error.message, 'invalid refresh token');
      assert.equal(error.statusCode, 400);
      assert.deepEqual(error.details, errorBody);
      return true;
    }
  );
});
