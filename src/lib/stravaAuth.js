const DEFAULT_TOKEN_URL = 'https://www.strava.com/oauth/token';

function mapTokenPayload(body) {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: body.expires_at,
    tokenType: body.token_type,
    athlete: body.athlete
  };
}

export async function refreshStravaToken({
  refreshToken,
  clientId,
  clientSecret,
  fetchImpl = fetch,
  tokenUrl = DEFAULT_TOKEN_URL
}) {
  const response = await fetchImpl(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    })
  });

  const payload = await response.json();

  if (!response.ok) {
    const message = payload.message ?? 'Failed to refresh Strava token';
    const error = new Error(message);
    error.statusCode = response.status;
    error.details = payload;
    throw error;
  }

  return mapTokenPayload(payload);
}
