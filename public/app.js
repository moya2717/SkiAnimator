function colorForDifficulty(level) {
  if (level === 'black') {
    return '#f97316';
  }
  if (level === 'blue') {
    return '#38bdf8';
  }
  return '#4ade80';
}

function drawSlope(context, width, height) {
  context.fillStyle = '#0b1021';
  context.fillRect(0, 0, width, height);

  context.fillStyle = '#1d4ed8';
  context.fillRect(0, 0, width, 34);

  context.strokeStyle = '#94a3b8';
  for (let y = 48; y < height; y += 24) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y + 10);
    context.stroke();
  }
}

function drawPixelSkier(context, x, y, color) {
  const pixels = [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [1, 2],
    [0, 3],
    [2, 3],
    [3, 4],
    [-1, 4]
  ];
  const size = 4;

  context.fillStyle = color;
  pixels.forEach(([dx, dy]) => {
    context.fillRect(x + dx * size, y + dy * size, size, size);
  });

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

function animateRuns(canvas, runs) {
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
    drawSlope(context, canvas.width, canvas.height);

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
  animateRuns(canvas, data.runs.slice(0, 4));
}

boot();
