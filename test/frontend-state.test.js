import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  appReducer,
  initialState,
  selectAvailableDays,
  selectAvailableYears,
  selectVisibleActivities,
  selectVisibleRuns
} from '../public/state.js';

const runsFixturePath = new URL('./fixtures/reducer-runs.fixture.json', import.meta.url);

test('appReducer clears selected run when difficulty filter hides it', async () => {
  const runs = JSON.parse(await readFile(runsFixturePath, 'utf8'));
  const withData = appReducer(initialState, { type: 'dashboard/set', payload: { runs, activities: [] } });
  const selected = appReducer(withData, { type: 'run/select', payload: 'run-a2' });
  const filtered = appReducer(selected, { type: 'difficulty/set', payload: 'blue' });

  assert.equal(filtered.difficultyFilter, 'blue');
  assert.equal(filtered.selectedRunId, null);
});

test('selectors apply deterministic search and year/day filters', () => {
  const state = {
    ...initialState,
    runs: [
      { id: 'a1', name: 'Morning Groomers', difficulty: 'green', sportType: 'AlpineSki' },
      { id: 'a2', name: 'Pow Day', difficulty: 'black', sportType: 'AlpineSki' }
    ],
    activities: [
      { id: 'a1', name: 'Morning Groomers', sportType: 'AlpineSki', startDateLocal: '2026-01-03T08:00:00Z' },
      { id: 'a2', name: 'Pow Day', sportType: 'AlpineSki', startDateLocal: '2025-02-06T08:00:00Z' }
    ],
    yearFilter: '2025',
    dayFilter: '2025-02-06',
    searchTerm: 'pow'
  };

  const visibleRuns = selectVisibleRuns(state);
  const visibleActivities = selectVisibleActivities(state);

  assert.deepEqual(visibleRuns.map((run) => run.id), ['a2']);
  assert.deepEqual(visibleActivities.map((activity) => activity.id), ['a2']);
});

test('selectors return sorted year and day options', () => {
  const state = {
    ...initialState,
    yearFilter: '2026',
    activities: [
      { id: 'a1', startDateLocal: '2025-12-25T08:00:00Z' },
      { id: 'a2', startDateLocal: '2026-01-04T09:00:00Z' },
      { id: 'a3', startDateLocal: '2026-01-03T10:00:00Z' }
    ]
  };

  assert.deepEqual(selectAvailableYears(state), ['2026', '2025']);
  assert.deepEqual(selectAvailableDays(state), ['2026-01-04', '2026-01-03']);
});
