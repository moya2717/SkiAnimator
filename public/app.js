import { chooseZoomForBounds, computeBounds, latLonToWorldPixels, tileRangeForBounds } from './geo.js';
import {
  appReducer,
  initialState,
  selectAvailableDays,
  selectAvailableYears,
  selectVisibleActivities,
  selectVisibleRuns
} from './state.js';

function colorForDifficulty(level) {
  if (level === 'black') return '#f97316';
  if (level === 'blue') return '#38bdf8';
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
  context.fillStyle = color;
  for (const [dx, dy] of pixels) {
    context.fillRect(x + dx * 4, y + dy * 4, 4, 4);
  }
  context.strokeStyle = '#e2e8f0';
  context.beginPath();
  context.moveTo(x - 8, y + 20);
  context.lineTo(x + 24, y + 28);
  context.stroke();
}

function createProjector(canvas, points, padding = 20) {
  const bounds = computeBounds(points);
  const lonSpan = Math.max(0.000001, bounds.maxLon - bounds.minLon);
  const latSpan = Math.max(0.000001, bounds.maxLat - bounds.minLat);
  const drawWidth = canvas.width - padding * 2;
  const drawHeight = canvas.height - padding * 2;

  return (point) => ({
    x: padding + ((point.lon - bounds.minLon) / lonSpan) * drawWidth,
    y: padding + (1 - (point.lat - bounds.minLat) / latSpan) * drawHeight
  });
}

function trackProgress(points, now) {
  const startMs = Date.parse(points[0].timestamp);
  const endMs = Date.parse(points[points.length - 1].timestamp);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 1;
  const duration = endMs - startMs + 1;
  const elapsedMs = ((now - startMs) % duration + duration) % duration;
  return elapsedMs / (endMs - startMs);
}

function interpolatePosition(points, progress) {
  if (points.length === 1) return points[0];
  const target = progress * (points.length - 1);
  const index = Math.floor(target);
  const nextIndex = Math.min(index + 1, points.length - 1);
  const blend = target - index;
  const current = points[index];
  const next = points[nextIndex];
  return { lat: current.lat + (next.lat - current.lat) * blend, lon: current.lon + (next.lon - current.lon) * blend };
}

function drawTrack(context, projectedPoints, color) {
  if (projectedPoints.length < 2) return;
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
  if (!drawContext) return null;

  drawBackdrop(drawContext, canvas.width, canvas.height);
  const tiles = [];
  for (let tileX = tileRange.minTileX; tileX <= tileRange.maxTileX; tileX += 1) {
    for (let tileY = tileRange.minTileY; tileY <= tileRange.maxTileY; tileY += 1) {
      const url = `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`;
      tiles.push(loadTileImage(url).then((image) => ({ image, tileX, tileY })).catch(() => null));
    }
  }

  for (const tile of (await Promise.all(tiles)).filter(Boolean)) {
    drawContext.drawImage(tile.image, padding + tile.tileX * 256 - topLeftWorld.x, padding + tile.tileY * 256 - topLeftWorld.y, 256, 256);
  }

  drawContext.fillStyle = 'rgba(2, 6, 23, 0.25)';
  drawContext.fillRect(0, 0, canvas.width, canvas.height);
  return drawCanvas;
}

let animationToken = 0;

async function animateRunTrack(canvas, run, track) {
  const context = canvas.getContext('2d');
  if (!context || !track?.points?.length) return;

  const localToken = ++animationToken;
  const project = createProjector(canvas, track.points);
  const projectedTrack = track.points.map(project);
  const mapBackdrop = await buildMapBackdrop(canvas, track.points);

  function frame() {
    if (localToken !== animationToken) return;
    if (mapBackdrop) context.drawImage(mapBackdrop, 0, 0);
    else drawBackdrop(context, canvas.width, canvas.height);
    drawTrack(context, projectedTrack, colorForDifficulty(run.difficulty));

    const progress = trackProgress(track.points, Date.now());
    const projectedPosition = project(interpolatePosition(track.points, progress));
    context.fillStyle = '#e2e8f0';
    context.fillText(run.name, 12, 50);
    drawPixelSkier(context, projectedPosition.x, projectedPosition.y, colorForDifficulty(run.difficulty));
    requestAnimationFrame(frame);
  }

  frame();
}

function animateFallbackRuns(canvas, runs) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const localToken = ++animationToken;
  const lanes = runs.map((run, index) => ({
    y: 44 + index * 56,
    speed: Math.max(0.8, run.distanceKm / Math.max(1, run.durationMinutes)) * 2.5,
    x: 18,
    color: colorForDifficulty(run.difficulty)
  }));

  function frame() {
    if (localToken !== animationToken) return;
    drawBackdrop(context, canvas.width, canvas.height);
    lanes.forEach((lane, index) => {
      lane.x = lane.x > canvas.width - 35 ? 18 : lane.x + lane.speed;
      context.fillStyle = '#e2e8f0';
      context.fillText(runs[index].name, 10, lane.y - 8);
      drawPixelSkier(context, lane.x, lane.y, lane.color);
    });
    requestAnimationFrame(frame);
  }

  frame();
}

async function loadJson(path) {
  const response = await fetch(path);
  return response.json();
}

function renderRuns(element, runs, selectedRunId) {
  element.innerHTML = runs.length
    ? runs
        .map(
          (run) =>
            `<li data-run-id="${run.id}" class="${selectedRunId === run.id ? 'selected' : ''}"><strong>${run.name}</strong> • ${run.difficulty} • ${run.distanceKm} km • ${run.durationMinutes} min</li>`
        )
        .join('')
    : '<li>No runs match the selected filters.</li>';
}

function renderActivities(element, activities) {
  element.innerHTML = activities.length
    ? activities
        .map((a) => `<li><strong>${a.name}</strong> • ${a.sportType} • ${a.distanceKm} km • ${a.durationMinutes} min</li>`)
        .join('')
    : '<li>No activities match the selected filters.</li>';
}

function syncSelectOptions(select, values, allLabel) {
  const currentValue = select.value;
  select.innerHTML = '';
  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = allLabel;
  select.append(allOption);

  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.append(option);
  });

  select.value = values.includes(currentValue) ? currentValue : 'all';
}

function stravaStatusMessage(search) {
  const params = new URLSearchParams(search);
  const status = params.get('strava');
  const reason = params.get('strava_reason');
  if (status === 'connected') return 'Strava connected successfully.';
  if (status === 'not-configured') return 'Strava is not configured on this server.';
  if (status === 'missing-code') return 'Strava callback did not include an authorization code.';
  if (status === 'denied') return `Strava authorization was denied${reason ? ` (${reason})` : ''}.`;
  if (status === 'auth-error') return `Strava token exchange failed${reason ? ` (${reason})` : ''}.`;
  return null;
}

async function boot() {
  const connectButton = document.querySelector('#connectBtn');
  const disconnectButton = document.querySelector('#disconnectBtn');
  const connectionStatus = document.querySelector('#connectionStatus');
  const meta = document.querySelector('#meta');
  const canvas = document.querySelector('#runCanvas');
  const runsList = document.querySelector('#runsList');
  const activitiesList = document.querySelector('#activitiesList');
  const searchInput = document.querySelector('#searchInput');
  const yearFilter = document.querySelector('#yearFilter');
  const dayFilter = document.querySelector('#dayFilter');
  const difficultyFilter = document.querySelector('#difficultyFilter');

  if (!(connectButton && disconnectButton && connectionStatus && meta && canvas instanceof HTMLCanvasElement && runsList && activitiesList && searchInput && yearFilter instanceof HTMLSelectElement && dayFilter instanceof HTMLSelectElement && difficultyFilter instanceof HTMLSelectElement)) return;

  let state = initialState;
  const dispatch = (action) => {
    state = appReducer(state, action);
    const visibleRuns = selectVisibleRuns(state);
    const visibleActivities = selectVisibleActivities(state);
    renderRuns(runsList, visibleRuns, state.selectedRunId);
    renderActivities(activitiesList, visibleActivities);
    syncSelectOptions(yearFilter, selectAvailableYears(state), 'All years');
    yearFilter.value = state.yearFilter;
    syncSelectOptions(dayFilter, selectAvailableDays(state), 'All days');
    dayFilter.value = state.dayFilter;
    const primaryRun = visibleRuns.find((run) => run.id === state.selectedRunId) ?? visibleRuns[0];
    if (primaryRun) loadJson(`/api/runs/${encodeURIComponent(primaryRun.id)}/track`).then((track) => animateRunTrack(canvas, primaryRun, track)).catch(() => animateFallbackRuns(canvas, visibleRuns.slice(0, 4)));
    else animateFallbackRuns(canvas, state.runs.slice(0, 4));
  };

  const status = await loadJson('/api/strava/status');
  const runsPayload = await loadJson('/api/runs');
  const activitiesPayload = await loadJson('/api/activities');

  meta.textContent = `${runsPayload.resort ?? 'Dashboard'} • ${runsPayload.date ?? new Date().toISOString().slice(0, 10)}`;
  const callbackMessage = stravaStatusMessage(window.location.search);
  connectionStatus.textContent = callbackMessage ?? (status.connected ? `Connected as ${status.athlete?.username ?? 'athlete'} • ${activitiesPayload.activities.length} alpine ski activities loaded` : 'Using deterministic fixture data. Connect Strava for your alpine ski activities.');

  connectButton.disabled = !status.configured;
  connectButton.addEventListener('click', async () => {
    const payload = await loadJson('/api/strava/connect');
    if (payload.authorizeUrl) window.location.href = payload.authorizeUrl;
  });
  disconnectButton.addEventListener('click', async () => {
    await fetch('/api/strava/logout');
    window.location.reload();
  });

  searchInput.addEventListener('input', () => dispatch({ type: 'search/set', payload: searchInput.value }));
  yearFilter.addEventListener('change', () => dispatch({ type: 'year/set', payload: yearFilter.value }));
  dayFilter.addEventListener('change', () => dispatch({ type: 'day/set', payload: dayFilter.value }));
  difficultyFilter.addEventListener('change', () => dispatch({ type: 'difficulty/set', payload: difficultyFilter.value }));
  runsList.addEventListener('click', (event) => {
    const item = event.target instanceof HTMLElement ? event.target.closest('[data-run-id]') : null;
    if (item instanceof HTMLElement && item.dataset.runId) {
      dispatch({ type: 'run/select', payload: item.dataset.runId });
    }
  });

  dispatch({ type: 'dashboard/set', payload: { runs: runsPayload.runs, activities: activitiesPayload.activities } });
}

boot();
