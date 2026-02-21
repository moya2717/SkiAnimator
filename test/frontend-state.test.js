import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { appReducer, initialState, selectVisibleActivities, selectVisibleRuns } from '../public/state.js';

const runsFixturePath = new URL('./fixtures/reducer-runs.fixture.json', import.meta.url);

test('appReducer clears selected run when difficulty filter hides it', async () => {
  const runs = JSON.parse(await readFile(runsFixturePath, 'utf8'));
  const withData = appReducer(initialState, { type: 'dashboard/set', payload: { runs, activities: [] } });
  const selected = appReducer(withData, { type: 'run/select', payload: 'run-a2' });
  const filtered = appReducer(selected, { type: 'difficulty/set', payload: 'blue' });

  assert.equal(filtered.difficultyFilter, 'blue');
  assert.equal(filtered.selectedRunId, null);
});

test('selectors apply deterministic search and sport filters', () => {
  const state = {
    ...initialState,
    runs: [
      { id: 'r1', name: 'Morning Groomers', difficulty: 'green', sportType: 'AlpineSki' },
      { id: 'r2', name: 'Pow Day', difficulty: 'black', sportType: 'AlpineSki' }
    ],
    activities: [
      { id: 'a1', name: 'Morning Ride', sportType: 'Ride' },
      { id: 'a2', name: 'Pow Day', sportType: 'AlpineSki' }
    ],
    sportFilter: 'AlpineSki',
    searchTerm: 'pow'
  };

  const visibleRuns = selectVisibleRuns(state);
  const visibleActivities = selectVisibleActivities(state);

  assert.deepEqual(visibleRuns.map((run) => run.id), ['r2']);
  assert.deepEqual(visibleActivities.map((activity) => activity.id), ['a2']);
});
