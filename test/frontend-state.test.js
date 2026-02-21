import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { appReducer, initialState, selectVisibleRuns } from '../public/state.js';

const runsFixturePath = new URL('./fixtures/reducer-runs.fixture.json', import.meta.url);

test('appReducer keeps selected run only when it remains visible after filter change', async () => {
  const runs = JSON.parse(await readFile(runsFixturePath, 'utf8'));

  const withRuns = appReducer(initialState, { type: 'runs/set', payload: runs });
  const selected = appReducer(withRuns, { type: 'run/select', payload: 'run-a2' });
  const filtered = appReducer(selected, { type: 'filter/set', payload: 'blue' });

  assert.equal(filtered.filter, 'blue');
  assert.equal(filtered.selectedRunId, null);
});

test('appReducer preserves selected run across run list updates when run still exists', async () => {
  const runs = JSON.parse(await readFile(runsFixturePath, 'utf8'));
  const withRuns = appReducer(initialState, { type: 'runs/set', payload: runs });
  const selected = appReducer(withRuns, { type: 'run/select', payload: 'run-b1' });

  const nextRuns = runs.filter((run) => run.id !== 'run-a2');
  const updated = appReducer(selected, { type: 'runs/set', payload: nextRuns });

  assert.equal(updated.selectedRunId, 'run-b1');
  assert.equal(selectVisibleRuns(updated.runs, 'all').length, 2);
});
