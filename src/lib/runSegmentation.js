const EARTH_RADIUS_M = 6371000;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineDistanceMeters(pointA, pointB) {
  const latDelta = toRadians(pointB.lat - pointA.lat);
  const lonDelta = toRadians(pointB.lon - pointA.lon);
  const latA = toRadians(pointA.lat);
  const latB = toRadians(pointB.lat);

  const term =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(lonDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(term));
}

function shouldSplit(previous, current, options) {
  const timeGapSec = (Date.parse(current.timestamp) - Date.parse(previous.timestamp)) / 1000;
  const jumpMeters = haversineDistanceMeters(previous, current);
  const elevationJump = Math.abs((current.elevationM ?? 0) - (previous.elevationM ?? 0));

  return (
    timeGapSec > options.maxGapSeconds ||
    jumpMeters > options.maxJumpMeters ||
    elevationJump > options.maxElevationJumpM
  );
}

export function segmentRunPoints(points, customOptions = {}) {
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }

  const options = {
    maxGapSeconds: 120,
    maxJumpMeters: 250,
    maxElevationJumpM: 80,
    ...customOptions
  };

  return points.slice(1).reduce(
    (segments, currentPoint) => {
      const activeSegment = segments[segments.length - 1];
      const previousPoint = activeSegment[activeSegment.length - 1];

      if (shouldSplit(previousPoint, currentPoint, options)) {
        segments.push([currentPoint]);
        return segments;
      }

      activeSegment.push(currentPoint);
      return segments;
    },
    [[points[0]]]
  );
}
