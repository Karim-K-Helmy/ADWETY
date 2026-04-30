const SESSION_KEY = 'adwety_dashboard_session';
const LEGACY_SESSION_KEY = 'adwety_dashboard_session';

function getSessionStore() {
  return window.sessionStorage;
}

function sanitizeSessionMarker(session) {
  if (!session || typeof session !== 'object') return null;
  return { authenticated: Boolean(session.authenticated ?? true) };
}

export function getStoredSession() {
  try {
    let raw = getSessionStore().getItem(SESSION_KEY);
    if (!raw) {
      raw = window.localStorage.getItem(LEGACY_SESSION_KEY);
      if (raw) window.localStorage.removeItem(LEGACY_SESSION_KEY);
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return sanitizeSessionMarker(parsed);
  } catch (_error) {
    clearStoredSession();
    return null;
  }
}

export function setStoredSession(session = {}) {
  const marker = sanitizeSessionMarker(session);
  if (!marker) return;
  getSessionStore().setItem(SESSION_KEY, JSON.stringify(marker));
}

export function clearStoredSession() {
  try { window.sessionStorage.removeItem(SESSION_KEY); } catch (_error) {}
  try { window.localStorage.removeItem(LEGACY_SESSION_KEY); } catch (_error) {}
}
