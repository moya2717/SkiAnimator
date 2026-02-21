import { chooseZoomForBounds, computeBounds, latLonToWorldPixels, tileRangeForBounds } from './geo.js';

function colorForDifficulty(level) {
  if (level === 'black') {
    return '#f97316';
  }
  if (level === 'blue') {
    return '#38bdf8';
  }
  return '#4ade80';
}

function drawBackdrop(context, width, height) {
  context.fillStyle = '#0b1021';
  context.fillRect(0, 0, width, height);

  context.fillStyle = '#1d4ed8';
  context.fillRect(0, 0, width, 34);

  context.strokeStyle = '#334155';
  for (let y = 48; y < height; y += 24) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y + 10);
    context.stroke();
  }
}

function drawPixelSkier(context, x, y, color) {
  const pixels = [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [0, 3], [2, 3], [3, 4], [-1, 4]];
  const size = 4;

  context.fillStyle = color;
  pixels.forEach(([dx, dy]) => context.fillRect(x + dx * size, y + dy * size, size, size));

  context.strokeStyle = '#e2e8f0';
  context.beginPath();
  context.moveTo(x - 8, y + 20);
  context.lineTo(x + 24, y + 28);
  context.stroke();
}

function renderRunList(element, runs) {
  element.innerHTML = runs
    .map(
      (run) =>
        `<li><strong>${run.name}</strong> — ${run.distanceKm} km, ${run.verticalM} m vertical, ${run.durationMinutes} min (${run.source})</li>`
    )
    .join('');
}

function createProjector(canvas, points, padding = 20) {
  const bounds = computeBounds(points);
  const lonSpan = Math.max(0.000001, bounds.maxLon - bounds.minLon);
  const latSpan = Math.max(0.000001, bounds.maxLat - bounds.minLat);
  const drawWidth = canvas.width - padding * 2;
  const drawHeight = canvas.height - padding * 2;

  return function project(point) {
    const x = padding + ((point.lon - bounds.minLon) / lonSpan) * drawWidth;
    const y = padding + (1 - (point.lat - bounds.minLat) / latSpan) * drawHeight;
    return { x, y };
  };
}

function trackProgress(points, now) {
  const startMs = Date.parse(points[0].timestamp);
  const endMs = Date.parse(points[points.length - 1].timestamp);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 1;
  }
  const elapsedMs = ((now - startMs) % (endMs - startMs + 1) + (endMs - startMs + 1)) % (endMs - startMs + 1);
  return elapsedMs / (endMs - startMs);
}

function interpolatePosition(points, progress) {
  if (points.length === 1) {
    return points[0];
  }

  const target = progress * (points.length - 1);
  const index = Math.floor(target);
  const nextIndex = Math.min(index + 1, points.length - 1);
  const blend = target - index;
  const current = points[index];
  const next = points[nextIndex];

  return {
    lat: current.lat + (next.lat - current.lat) * blend,
    lon: current.lon + (next.lon - current.lon) * blend
  };
}

function drawTrack(context, projectedPoints, color) {
  if (projectedPoints.length < 2) {
    return;
  }

  context.strokeStyle = color;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(projectedPoints[0].x, projectedPoints[0].y);
  projectedPoints.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.stroke();
}

function loadTileImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${url}`));
    image.src = url;
  });
}

async function buildMapBackdrop(canvas, points, padding = 20) {
  const bounds = computeBounds(points);
  const zoom = chooseZoomForBounds(bounds, canvas.width, canvas.height, padding);
  const tileRange = tileRangeForBounds(bounds, zoom);
  const topLeftWorld = latLonToWorldPixels(bounds.maxLat, bounds.minLon, zoom);
  const drawCanvas = document.createElement('canvas');

  drawCanvas.width = canvas.width;
  drawCanvas.height = canvas.height;
  const drawContext = drawCanvas.getContext('2d');
  if (!drawContext) {
    return null;
  }

  drawBackdrop(drawContext, canvas.width, canvas.height);

  const tilePromises = [];
  for (let tileX = tileRange.minTileX; tileX <= tileRange.maxTileX; tileX += 1) {
    for (let tileY = tileRange.minTileY; tileY <= tileRange.maxTileY; tileY += 1) {
      const url = `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`;
      tilePromises.push(
        loadTileImage(url)
          .then((image) => ({ image, tileX, tileY }))
          .catch(() => null)
      );
    }
  }

  const tiles = await Promise.all(tilePromises);
  const visibleTiles = tiles.filter(Boolean);
  if (visibleTiles.length === 0) {
    return null;
  }

  visibleTiles.forEach(({ image, tileX, tileY }) => {
    const dx = padding + tileX * 256 - topLeftWorld.x;
    const dy = padding + tileY * 256 - topLeftWorld.y;
    drawContext.drawImage(image, dx, dy, 256, 256);
  });

  drawContext.fillStyle = 'rgba(2, 6, 23, 0.25)';
  drawContext.fillRect(0, 0, canvas.width, canvas.height);
  return drawCanvas;
}

async function animateRunTrack(canvas, run, track) {
  const context = canvas.getContext('2d');
  if (!context || !track || !Array.isArray(track.points) || track.points.length === 0) {
    return;
  }

  const project = createProjector(canvas, track.points);
  const projectedTrack = track.points.map(project);
  const mapBackdrop = await buildMapBackdrop(canvas, track.points);

  function frame() {
    if (mapBackdrop) {
      context.drawImage(mapBackdrop, 0, 0);
    } else {
      drawBackdrop(context, canvas.width, canvas.height);
    }
    drawTrack(context, projectedTrack, colorForDifficulty(run.difficulty));

    const progress = trackProgress(track.points, Date.now());
    const position = interpolatePosition(track.points, progress);
    const projectedPosition = project(position);

    context.fillStyle = '#e2e8f0';
    context.fillText(run.name, 12, 50);
    drawPixelSkier(context, projectedPosition.x, projectedPosition.y, colorForDifficulty(run.difficulty));

    requestAnimationFrame(frame);
  }

  frame();
}

function animateFallbackRuns(canvas, runs) {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const lanes = runs.map((run, index) => ({
    y: 44 + index * 56,
    speed: Math.max(0.8, run.distanceKm / Math.max(1, run.durationMinutes)) * 2.5,
    x: 18,
    color: colorForDifficulty(run.difficulty)
  }));

  function frame() {
    drawBackdrop(context, canvas.width, canvas.height);

    lanes.forEach((lane, index) => {
      lane.x += lane.speed;
      if (lane.x > canvas.width - 35) {
        lane.x = 18;
      }

      context.fillStyle = '#e2e8f0';
      context.fillText(runs[index].name, 10, lane.y - 8);
      drawPixelSkier(context, lane.x, lane.y, lane.color);
    });

    requestAnimationFrame(frame);
  }

  frame();
}

async function loadStatus() {
  const response = await fetch('/api/strava/status');
  return response.json();
}

async function loadRunTrack(runId) {
  const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/track`);
  if (!response.ok) {
    return null;
  }
  return response.json();
}


function stravaStatusMessage(search) {
  const params = new URLSearchParams(search);
  const status = params.get('strava');
  const reason = params.get('strava_reason');

  if (status === 'connected') {
    return 'Strava connected successfully.';
  }
  if (status === 'not-configured') {
    return 'Strava is not configured on this server. Add STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET before connecting.';
  }
  if (status === 'missing-code') {
    return 'Strava callback did not include an authorization code. Verify your callback URL exactly matches the one in Strava app settings.';
  }
  if (status === 'denied') {
    return `Strava authorization was denied${reason ? ` (${reason})` : ''}.`;
  }
  if (status === 'auth-error') {
    const reasonSuffix = reason ? ` (${reason})` : '';
    return `Strava token exchange failed${reasonSuffix}. Check client ID/secret and callback URL in Strava app settings.`;
  }

  return null;
}

async function boot() {
  const connectButton = document.querySelector('#connectBtn');
  const disconnectButton = document.querySelector('#disconnectBtn');
  const connectionStatus = document.querySelector('#connectionStatus');
  const meta = document.querySelector('#meta');
  const canvas = document.querySelector('#runCanvas');
  const list = document.querySelector('#runsList');

  if (!(connectButton && disconnectButton && connectionStatus && meta && canvas instanceof HTMLCanvasElement && list)) {
    return;
  }

  const status = await loadStatus();
  const callbackMessage = stravaStatusMessage(window.location.search);
  connectionStatus.textContent = callbackMessage
    ? callbackMessage
    : status.connected
      ? `Connected to Strava as ${status.athlete?.username ?? 'athlete'}`
      : 'Using deterministic fixture data. Connect Strava for personal runs.';

  connectButton.disabled = !status.configured;
  connectButton.addEventListener('click', async () => {
    const response = await fetch('/api/strava/connect');
    const payload = await response.json();
    if (payload.authorizeUrl) {
      window.location.href = payload.authorizeUrl;
    }
  });

  disconnectButton.addEventListener('click', async () => {
    await fetch('/api/strava/logout');
    window.location.reload();
  });

  const runsResponse = await fetch('/api/runs');
  const data = await runsResponse.json();
  const hasStravaRuns = Array.isArray(data.runs) && data.runs.some((run) => run.source === 'strava');

  if (status.connected && !hasStravaRuns && !callbackMessage) {
    connectionStatus.textContent =
      'Connected to Strava, but no ski/snowboard activities were found yet. Recording a winter activity in Strava should populate this view.';
  }

  meta.textContent = `${data.resort} • ${data.date}`;
  renderRunList(list, data.runs);

  const primaryRun = data.runs[0];
  const track = primaryRun ? await loadRunTrack(primaryRun.id) : null;
  if (track) {
    await animateRunTrack(canvas, primaryRun, track);
    return;
  }

  animateFallbackRuns(canvas, data.runs.slice(0, 4));
}

boot();
