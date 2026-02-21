export function computeBounds(points) {
  return points.reduce(
    (bounds, point) => ({
      minLat: Math.min(bounds.minLat, point.lat),
      maxLat: Math.max(bounds.maxLat, point.lat),
      minLon: Math.min(bounds.minLon, point.lon),
      maxLon: Math.max(bounds.maxLon, point.lon)
    }),
    { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity }
  );
}

export function latLonToWorldPixels(lat, lon, zoom) {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const scale = 256 * 2 ** zoom;
  const x = ((lon + 180) / 360) * scale;
  const y =
    (0.5 - Math.log((1 + Math.min(0.9999, Math.max(-0.9999, sinLat))) / (1 - Math.min(0.9999, Math.max(-0.9999, sinLat)))) / (4 * Math.PI)) *
    scale;

  return { x, y };
}

export function chooseZoomForBounds(bounds, width, height, padding = 20, minZoom = 9, maxZoom = 15) {
  const safeWidth = Math.max(1, width - padding * 2);
  const safeHeight = Math.max(1, height - padding * 2);

  for (let zoom = maxZoom; zoom >= minZoom; zoom -= 1) {
    const topLeft = latLonToWorldPixels(bounds.maxLat, bounds.minLon, zoom);
    const bottomRight = latLonToWorldPixels(bounds.minLat, bounds.maxLon, zoom);
    const spanX = Math.abs(bottomRight.x - topLeft.x);
    const spanY = Math.abs(bottomRight.y - topLeft.y);

    if (spanX <= safeWidth && spanY <= safeHeight) {
      return zoom;
    }
  }

  return minZoom;
}

export function tileRangeForBounds(bounds, zoom) {
  const topLeft = latLonToWorldPixels(bounds.maxLat, bounds.minLon, zoom);
  const bottomRight = latLonToWorldPixels(bounds.minLat, bounds.maxLon, zoom);

  return {
    minTileX: Math.floor(Math.min(topLeft.x, bottomRight.x) / 256),
    maxTileX: Math.floor(Math.max(topLeft.x, bottomRight.x) / 256),
    minTileY: Math.floor(Math.min(topLeft.y, bottomRight.y) / 256),
    maxTileY: Math.floor(Math.max(topLeft.y, bottomRight.y) / 256)
  };
}
