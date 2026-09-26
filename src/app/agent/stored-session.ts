/**
 * This tab's live session, kept in sessionStorage (per tab) so a reload can
 * pick the conversation back up. Only ever written for a graph the user
 * agreed to share.
 */
/** Where the session is kept. */
const AGENT_SESSION_STORAGE_KEY = 'kidraw_agent_session_v1';

export interface StoredSession {
  /** The endpoint it was opened on. */
  url: string;
  /** The graph it was given consent for. */
  graphKey: string;
  sessionId: string;
  secret: string;
  panelOpen: boolean;
}

/** Whether a session is waiting to be resumed; cheap, and safe to call
 *  before the rest of agent mode has loaded. */
export function hasStoredSession(): boolean {
  return readStoredSession() !== null;
}

export function readStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(AGENT_SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) as StoredSession : null;
  } catch {
    return null;
  }
}

export function writeStoredSession(session: StoredSession): void {
  try {
    sessionStorage.setItem(AGENT_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Private mode or storage disabled: reloads just start a new session.
  }
}

/** Change some fields of the stored session, if there is one. */
export function updateStoredSession(changes: Partial<StoredSession>): void {
  const stored = readStoredSession();
  if (stored) writeStoredSession({...stored, ...changes});
}

export function clearStoredSession(): void {
  try {
    sessionStorage.removeItem(AGENT_SESSION_STORAGE_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}
