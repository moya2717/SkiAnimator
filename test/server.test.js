import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const fixturePath = new URL('../src/data/runs.fixture.json', import.meta.url);

test('fixture has deterministic run data', async () => {
  const raw = await readFile(fixturePath, 'utf8');
  const data = JSON.parse(raw);

  assert.equal(data.resort, 'Alpine Ridge');
  assert.equal(data.runs.length, 3);
  assert.deepEqual(data.runs.map((run) => run.name), [
    'Summit Line',
    'Pine Traverse',
    'Valley Cruiser'
  ]);
});
