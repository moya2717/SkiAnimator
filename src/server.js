import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createFixtureStore } from './lib/dataStore.js';
import { refreshStravaToken } from './lib/stravaAuth.js';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchAthleteActivities,
  fetchActivityStreams,
  mapActivitiesToAnimationRuns,
  mapActivitiesToAlpineActivities,
  mapActivityStreamsToTrack
} from './lib/stravaClient.js';
import { createTokenStore } from './lib/tokenStore.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const fixtureDir = process.env.FIXTURE_DIR ?? join(__dirname, 'data');
const STRAVA_DEFAULT_PER_PAGE = 100;
const STRAVA_MAX_PAGES = 3;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function sendRedirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

function mapRouteToFile(urlPath) {
  if (urlPath === '/' || urlPath === '') {
    return join(publicDir, 'index.html');
  }

  const normalizedPath = urlPath.replace(/^\//, '');
  return join(publicDir, normalizedPath);
}

async function serveStaticFile(urlPath, response) {
  const filePath = mapRouteToFile(urlPath);
  const contentType = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream';

  try {
    const content = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentType });
    response.end(content);
  } catch {
    sendJson(response, 404, { error: 'File not found' });
  }
}

function matchPath(pathname, pattern) {
  const pathParts = pathname.split('/').filter(Boolean);
  const patternParts = pattern.split('/').filter(Boolean);

  if (pathParts.length !== patternParts.length) {
    return null;
  }

  return patternParts.reduce((params, part, index) => {
    if (params === null) {
      return null;
    }

    if (part.startsWith(':')) {
      return { ...params, [part.slice(1)]: pathParts[index] };
    }

    return pathParts[index] === part ? params : null;
  }, {});
}

function buildAppUrl(request) {
  const host = request.headers.host ?? 'localhost:3000';
  return `http://${host}`;
}

function createStravaConfig(env = process.env) {
  return {
    clientId: env.STRAVA_CLIENT_ID,
    clientSecret: env.STRAVA_CLIENT_SECRET
  };
}

function ensureStravaConfigured(config) {
  return Boolean(config.clientId && config.clientSecret);
}

function parseStravaRunId(runId) {
  const match = /^strava-(\d+)$/.exec(runId);
  return match ? Number(match[1]) : null;
}

function appendStravaReason(path, reason) {
  if (!reason) {
    return path;
  }

  const safeReason = String(reason).slice(0, 120);
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}strava_reason=${encodeURIComponent(safeReason)}`;
}


async function ensureFreshToken(tokenStore, stravaConfig) {
  const token = tokenStore.get();
  if (!token) {
    return null;
  }

  const nowEpoch = Math.floor(Date.now() / 1000);
  if (token.expires_at > nowEpoch + 30) {
    return token;
  }

  const refreshed = await refreshStravaToken({
    refreshToken: token.refresh_token,
    clientId: stravaConfig.clientId,
    clientSecret: stravaConfig.clientSecret
  });

  return tokenStore.set({
    access_token: refreshed.accessToken,
    refresh_token: refreshed.refreshToken,
    expires_at: refreshed.expiresAt,
    athlete: refreshed.athlete
  });
}

async function fetchAthleteActivityPages(accessToken, stravaFetch, perPage) {
  const allActivities = [];

  for (let page = 1; page <= STRAVA_MAX_PAGES; page += 1) {
    const activities = await fetchAthleteActivities({
      accessToken,
      perPage,
      page,
      fetchImpl: stravaFetch
    });

    if (activities.length === 0) {
      break;
    }

    allActivities.push(...activities);
    if (activities.length < perPage) {
      break;
    }
  }

  return allActivities;
}

export function createRequestHandler(
  store = createFixtureStore({ baseDir: fixtureDir }),
  options = {}
) {
  const stravaConfig = options.stravaConfig ?? createStravaConfig();
  const tokenStore = options.tokenStore ?? createTokenStore();
  const stravaFetch = options.stravaFetch ?? fetch;
  const stravaPageSize = options.stravaPageSize ?? STRAVA_DEFAULT_PER_PAGE;

  return async function requestHandler(request, response) {
    if (!request.url) {
      sendJson(response, 400, { error: 'Invalid request URL' });
      return;
    }

    const url = new URL(request.url, buildAppUrl(request));
    const { pathname } = url;

    if (pathname === '/api/health') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    if (pathname === '/api/strava/status') {
      const token = tokenStore.get();
      sendJson(response, 200, {
        configured: ensureStravaConfigured(stravaConfig),
        connected: Boolean(token),
        athlete: token?.athlete ?? null
      });
      return;
    }

    if (pathname === '/api/strava/connect') {
      if (!ensureStravaConfigured(stravaConfig)) {
        sendJson(response, 400, { error: 'Strava client configuration is missing' });
        return;
      }

      const redirectUri = `${buildAppUrl(request)}/auth/strava/callback`;
      const state = `ski-${Date.now()}`;
      const authorizeUrl = buildAuthorizeUrl({
        clientId: stravaConfig.clientId,
        redirectUri,
        state
      });

      sendJson(response, 200, { authorizeUrl });
      return;
    }

    if (pathname === '/auth/strava/callback') {
      if (!ensureStravaConfigured(stravaConfig)) {
        sendRedirect(response, '/?strava=not-configured');
        return;
      }

      const providerError = url.searchParams.get('error');
      if (providerError) {
        sendRedirect(response, appendStravaReason('/?strava=denied', providerError));
        return;
      }

      const code = url.searchParams.get('code');
      if (!code) {
        sendRedirect(response, '/?strava=missing-code');
        return;
      }

      const redirectUri = `${buildAppUrl(request)}/auth/strava/callback`;

      try {
        const token = await exchangeCodeForToken({
          code,
          clientId: stravaConfig.clientId,
          clientSecret: stravaConfig.clientSecret,
          redirectUri,
          fetchImpl: stravaFetch
        });

        tokenStore.set(token);
        sendRedirect(response, '/?strava=connected');
      } catch (error) {
        const reason = error?.details?.message ?? error?.message;
        sendRedirect(response, appendStravaReason('/?strava=auth-error', reason));
      }
      return;
    }

    if (pathname === '/api/strava/logout') {
      tokenStore.clear();
      sendJson(response, 200, { ok: true });
      return;
    }

    if (pathname === '/api/runs') {
      async function sendFallbackRuns() {
        const fallback = await store.getRunsFixture();
        sendJson(response, 200, { ...fallback, mode: 'fixture' });
      }

      if (!ensureStravaConfigured(stravaConfig) || !tokenStore.get()) {
        await sendFallbackRuns();
        return;
      }

      try {
        const token = await ensureFreshToken(tokenStore, stravaConfig);
        const activities = await fetchAthleteActivityPages(token.access_token, stravaFetch, stravaPageSize);
        const runs = mapActivitiesToAnimationRuns(activities);

        sendJson(response, 200, {
          resort: token.athlete?.username ?? 'Strava Skier',
          date: new Date().toISOString().slice(0, 10),
          runs,
          mode: 'strava',
          totalActivities: activities.length
        });
      } catch {
        await sendFallbackRuns();
      }
      return;
    }

    if (pathname === '/api/activities') {
      async function sendFallbackActivities() {
        const fallback = await store.getRunsFixture();
        const activities = fallback.runs.map((run) => ({
          id: run.id,
          name: run.name,
          sportType: 'AlpineSki',
          distanceKm: run.distanceKm,
          verticalM: run.verticalM,
          durationMinutes: run.durationMinutes,
          startDateLocal: `${fallback.date}T00:00:00Z`,
          source: 'fixture'
        }));

        sendJson(response, 200, { activities, mode: 'fixture' });
      }

      if (!ensureStravaConfigured(stravaConfig) || !tokenStore.get()) {
        await sendFallbackActivities();
        return;
      }

      try {
        const token = await ensureFreshToken(tokenStore, stravaConfig);
        const activities = await fetchAthleteActivityPages(token.access_token, stravaFetch, stravaPageSize);
        sendJson(response, 200, {
          activities: mapActivitiesToAlpineActivities(activities),
          mode: 'strava'
        });
      } catch {
        await sendFallbackActivities();
      }
      return;
    }

    if (pathname === '/api/ski-days') {
      sendJson(response, 200, await store.getSkiDays());
      return;
    }

    const skiDayMatch = matchPath(pathname, '/api/ski-days/:id/runs');
    if (skiDayMatch) {
      const runs = await store.getRunsByDay(skiDayMatch.id);
      if (!runs) {
        sendJson(response, 404, { error: 'Ski day not found' });
        return;
      }

      sendJson(response, 200, runs);
      return;
    }

    const runTrackMatch = matchPath(pathname, '/api/runs/:id/track');
    if (runTrackMatch) {
      const runId = runTrackMatch.id;

      if (ensureStravaConfigured(stravaConfig) && tokenStore.get()) {
        try {
          const activityId = parseStravaRunId(runId);
          if (activityId) {
            const token = await ensureFreshToken(tokenStore, stravaConfig);
            const activities = await fetchAthleteActivityPages(token.access_token, stravaFetch, stravaPageSize);
            const activity = activities.find((item) => item.id === activityId);

            if (activity) {
              const streams = await fetchActivityStreams({
                activityId,
                accessToken: token.access_token,
                fetchImpl: stravaFetch
              });
              const track = mapActivityStreamsToTrack(activity, streams);
              if (track) {
                sendJson(response, 200, track);
                return;
              }
            }
          }
        } catch {
          // fallback to deterministic fixtures below
        }
      }

      const fixtureTrack = await store.getRunTrack(runId);
      if (!fixtureTrack) {
        sendJson(response, 404, { error: 'Run track not found' });
        return;
      }

      sendJson(response, 200, fixtureTrack);
      return;
    }

    await serveStaticFile(pathname, response);
  };
}

export function createAppServer(store, options) {
  return createServer(createRequestHandler(store, options));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  const server = createAppServer();
  server.listen(port, () => {
    console.log(`SkiAnimator running at http://localhost:${port}`);
  });
}
