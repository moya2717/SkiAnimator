import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { segmentRunPoints } from '../src/lib/runSegmentation.js';

const gpsFixturePath = new URL('./fixtures/gps-elevation.fixture.json', import.meta.url);

test('segmentRunPoints splits on time and distance/elevation jumps using fixed fixtures', async () => {
  const raw = await readFile(gpsFixturePath, 'utf8');
  const points = JSON.parse(raw);

  const segments = segmentRunPoints(points, {
    maxGapSeconds: 120,
    maxJumpMeters: 400,
    maxElevationJumpM: 100
  });

  assert.equal(segments.length, 3);
  assert.equal(segments[0].length, 3);
  assert.equal(segments[1].length, 1);
  assert.equal(segments[2].length, 2);
  assert.equal(segments[2][0].timestamp, '2026-02-10T08:06:45Z');
});

test('segmentRunPoints returns empty array for empty fixtures', () => {
  assert.deepEqual(segmentRunPoints([]), []);
});
