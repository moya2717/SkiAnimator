import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

function parseFixture(file) {
  return JSON.parse(file);
}

async function readFixture(baseDir, fileName) {
  const raw = await readFile(join(baseDir, fileName), 'utf8');
  return parseFixture(raw);
}

export function createFixtureStore({ baseDir }) {
  return {
    async getRunsFixture() {
      return readFixture(baseDir, 'runs.fixture.json');
    },
    async getSkiDays() {
      return readFixture(baseDir, 'ski-days.fixture.json');
    },
    async getRunsByDay(dayId) {
      const runsByDay = await readFixture(baseDir, 'runs-by-day.fixture.json');
      return runsByDay[dayId] ?? null;
    },
    async getRunTrack(runId) {
      const tracksByRun = await readFixture(baseDir, 'tracks-by-run.fixture.json');
      return tracksByRun[runId] ?? null;
    }
  };
}
