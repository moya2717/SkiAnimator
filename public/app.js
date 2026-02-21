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

function computeBounds(points) {
  return points.reduce(
    (bounds, point) => ({
      minLat: Math.min(bounds.minLat, point.lat),
      maxLat: Math.max(bounds.maxLat, point.lat),
      minLon: Math.min(bounds.minLon, point.lon),
      maxLon: Math.max(bounds.maxLon, point.lon)
    }),
    { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity }
  );
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

function animateRunTrack(canvas, run, track) {
  const context = canvas.getContext('2d');
  if (!context || !track || !Array.isArray(track.points) || track.points.length === 0) {
    return;
  }

  const project = createProjector(canvas, track.points);
  const projectedTrack = track.points.map(project);

  function frame() {
    drawBackdrop(context, canvas.width, canvas.height);
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
  connectionStatus.textContent = status.connected
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
  meta.textContent = `${data.resort} • ${data.date}`;
  renderRunList(list, data.runs);

  const primaryRun = data.runs[0];
  const track = primaryRun ? await loadRunTrack(primaryRun.id) : null;
  if (track) {
    animateRunTrack(canvas, primaryRun, track);
    return;
  }

  animateFallbackRuns(canvas, data.runs.slice(0, 4));
}

boot();
