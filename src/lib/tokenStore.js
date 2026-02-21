export function createTokenStore() {
  let token = null;

  return {
    get() {
      return token;
    },
    set(nextToken) {
      token = {
        access_token: nextToken.access_token,
        refresh_token: nextToken.refresh_token,
        expires_at: nextToken.expires_at,
        athlete: nextToken.athlete
      };
      return token;
    },
    clear() {
      token = null;
    }
  };
}
