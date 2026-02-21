import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createFixtureStore } from './lib/dataStore.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const fixtureDir = process.env.FIXTURE_DIR ?? join(__dirname, 'data');

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

export function createRequestHandler(store = createFixtureStore({ baseDir: fixtureDir })) {
  return async function requestHandler(request, response) {
    if (!request.url) {
      sendJson(response, 400, { error: 'Invalid request URL' });
      return;
    }

    const { pathname } = new URL(request.url, 'http://localhost');

    if (pathname === '/api/health') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    if (pathname === '/api/runs') {
      sendJson(response, 200, await store.getRunsFixture());
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
      const track = await store.getRunTrack(runTrackMatch.id);
      if (!track) {
        sendJson(response, 404, { error: 'Run track not found' });
        return;
      }

      sendJson(response, 200, track);
      return;
    }

    await serveStaticFile(pathname, response);
  };
}

export function createAppServer(store) {
  return createServer(createRequestHandler(store));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  const server = createAppServer();
  server.listen(port, () => {
    console.log(`SkiAnimator running at http://localhost:${port}`);
  });
}
