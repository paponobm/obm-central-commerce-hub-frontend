// The access token lives in memory only (never localStorage — that would
// be readable by any injected script). It's re-minted on every page load
// via the httpOnly refresh cookie (see auth-context.tsx), so losing it on
// refresh is expected and handled, not a bug.
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
