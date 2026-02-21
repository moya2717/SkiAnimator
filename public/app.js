function drawRunTracks(canvas, runs) {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  const colors = { black: '#f8fafc', blue: '#60a5fa', green: '#4ade80' };

  runs.forEach((run, index) => {
    const startX = 40;
    const startY = 30 + index * 80;
    const length = run.distanceKm * 120;

    context.beginPath();
    context.moveTo(startX, startY);
    context.bezierCurveTo(startX + length * 0.3, startY + 45, startX + length * 0.6, startY - 35, startX + length, startY + 25);
    context.strokeStyle = colors[run.difficulty] ?? '#cbd5e1';
    context.lineWidth = 4;
    context.stroke();

    context.fillStyle = '#e2e8f0';
    context.fillText(`${run.name} (${run.distanceKm}km)`, startX, startY - 10);
  });
}

function renderRunList(element, runs) {
  element.innerHTML = runs
    .map(
      (run) =>
        `<li><strong>${run.name}</strong> — ${run.distanceKm} km, ${run.verticalM} m vertical, ${run.durationMinutes} min (${run.difficulty})</li>`
    )
    .join('');
}

async function boot() {
  const response = await fetch('/api/runs');
  const data = await response.json();

  const meta = document.querySelector('#meta');
  const canvas = document.querySelector('#runCanvas');
  const list = document.querySelector('#runsList');

  if (!(meta && canvas instanceof HTMLCanvasElement && list)) {
    return;
  }

  meta.textContent = `${data.resort} • ${data.date}`;
  renderRunList(list, data.runs);
  drawRunTracks(canvas, data.runs);
}

boot();
