const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
const STRAVA_OAUTH_BASE = 'https://www.strava.com/oauth';

function buildQuery(params) {
  return new URLSearchParams(
    Object.entries(params).reduce((acc, [key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        acc[key] = String(value);
      }
      return acc;
    }, {})
  );
}

function normalizeSportType(activity) {
  return activity.sport_type ?? activity.type ?? '';
}

function isoTimestampFromOffset(baseTimestamp, secondsOffset) {
  const baseMs = Date.parse(baseTimestamp);
  if (!Number.isFinite(baseMs)) {
    return null;
  }
  return new Date(baseMs + secondsOffset * 1000).toISOString();
}

export function isWinterSport(activity) {
  const sportType = normalizeSportType(activity);
  return ['AlpineSki', 'BackcountrySki', 'NordicSki', 'Snowboard'].includes(sportType);
}

function activityDifficulty(activity) {
  if (activity.total_elevation_gain >= 900) {
    return 'black';
  }
  if (activity.total_elevation_gain >= 450) {
    return 'blue';
  }
  return 'green';
}

export function mapActivitiesToAnimationRuns(activities) {
  return activities.filter(isWinterSport).map((activity) => ({
    id: `strava-${activity.id}`,
    activityId: activity.id,
    name: activity.name,
    distanceKm: Number((activity.distance / 1000).toFixed(2)),
    verticalM: Math.round(activity.total_elevation_gain ?? 0),
    durationMinutes: Math.max(1, Math.round((activity.moving_time ?? 0) / 60)),
    difficulty: activityDifficulty(activity),
    startDateLocal: activity.start_date_local,
    source: 'strava'
  }));
}

export function buildAuthorizeUrl({ clientId, redirectUri, state }) {
  const query = buildQuery({
    client_id: clientId,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',
    redirect_uri: redirectUri,
    state
  });
  return `${STRAVA_OAUTH_BASE}/authorize?${query.toString()}`;
}

export async function exchangeCodeForToken({ code, clientId, clientSecret, fetchImpl = fetch }) {
  const response = await fetchImpl(`${STRAVA_OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.message ?? 'Failed to exchange Strava auth code');
    error.statusCode = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
}

export async function fetchAthleteActivities({ accessToken, perPage = 30, fetchImpl = fetch }) {
  const query = buildQuery({ per_page: perPage, page: 1 });
  const response = await fetchImpl(`${STRAVA_API_BASE}/athlete/activities?${query.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.message ?? 'Failed to fetch Strava activities');
    error.statusCode = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
}

export async function fetchActivityStreams({
  activityId,
  accessToken,
  keys = ['latlng', 'altitude', 'time'],
  fetchImpl = fetch
}) {
  const query = buildQuery({ keys: keys.join(','), key_by_type: true });
  const response = await fetchImpl(
    `${STRAVA_API_BASE}/activities/${activityId}/streams?${query.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.message ?? 'Failed to fetch Strava activity streams');
    error.statusCode = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
}

export function mapActivityStreamsToTrack(activity, streams) {
  const latlng = streams?.latlng?.data ?? [];
  const altitude = streams?.altitude?.data ?? [];
  const time = streams?.time?.data ?? [];

  if (!Array.isArray(latlng) || latlng.length === 0) {
    return null;
  }

  const points = latlng
    .map((coordinates, index) => {
      const [lat, lon] = coordinates;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }

      const secondsOffset = Number(time[index] ?? 0);
      return {
        lat,
        lon,
        elevationM: Number.isFinite(altitude[index]) ? Math.round(altitude[index]) : null,
        timestamp: isoTimestampFromOffset(activity.start_date, secondsOffset)
      };
    })
    .filter((point) => point && point.timestamp);

  if (points.length === 0) {
    return null;
  }

  return {
    runId: `strava-${activity.id}`,
    source: 'strava',
    points
  };
}
