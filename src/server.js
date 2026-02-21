import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const fixturePath = join(__dirname, 'data', 'runs.fixture.json');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(payload));
}

async function readRunsFixture() {
  const file = await readFile(fixturePath, 'utf8');
  return JSON.parse(file);
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
  const extension = extname(filePath);
  const contentType = MIME_TYPES[extension] ?? 'application/octet-stream';

  try {
    const content = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentType });
    response.end(content);
  } catch {
    sendJson(response, 404, { error: 'File not found' });
  }
}

async function requestHandler(request, response) {
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
    const runs = await readRunsFixture();
    sendJson(response, 200, runs);
    return;
  }

  await serveStaticFile(pathname, response);
}

const port = Number(process.env.PORT ?? 3000);
const server = createServer(requestHandler);

server.listen(port, () => {
  console.log(`SkiAnimator running at http://localhost:${port}`);
});
