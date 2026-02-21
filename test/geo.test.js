import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseZoomForBounds,
  computeBounds,
  latLonToWorldPixels,
  tileRangeForBounds
} from '../public/geo.js';

test('computeBounds returns min/max latitude and longitude', () => {
  const points = [
    { lat: 46.80, lon: -121.73 },
    { lat: 46.82, lon: -121.70 },
    { lat: 46.79, lon: -121.76 }
  ];

  assert.deepEqual(computeBounds(points), {
    minLat: 46.79,
    maxLat: 46.82,
    minLon: -121.76,
    maxLon: -121.7
  });
});

test('chooseZoomForBounds stays within requested zoom limits', () => {
  const bounds = {
    minLat: 46.79,
    maxLat: 46.82,
    minLon: -121.76,
    maxLon: -121.7
  };

  const zoom = chooseZoomForBounds(bounds, 820, 280, 20, 9, 15);

  assert.ok(zoom >= 9 && zoom <= 15);
});

test('latLonToWorldPixels and tileRangeForBounds produce stable tile coordinates', () => {
  const bounds = {
    minLat: 46.79,
    maxLat: 46.82,
    minLon: -121.76,
    maxLon: -121.7
  };

  const pixel = latLonToWorldPixels(46.8, -121.73, 12);
  assert.equal(Math.round(pixel.x), 169724);
  assert.equal(Math.round(pixel.y), 369664);

  const tiles = tileRangeForBounds(bounds, 12);
  assert.deepEqual(tiles, {
    minTileX: 662,
    maxTileX: 663,
    minTileY: 1443,
    maxTileY: 1444
  });
});
