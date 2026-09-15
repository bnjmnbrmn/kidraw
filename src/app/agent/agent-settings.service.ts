import {Injectable} from '@angular/core';
import {DETAIL_LEVELS, DetailLevel} from './agent-protocol';

/** A user-configured agent endpoint (notes/idea-mcp-server.md, "Opt-in and configuration"). */
export interface AgentEndpointSettings {
  /** e.g. wss://kidraw.net/agent/ */
  url: string;
  token: string;
  /** Shown in the header and consent prompt. */
  name: string;
  agent: string;
}

const SETTINGS_KEY = 'kidraw_agent_endpoint_v1';
const CONSENT_KEY = 'kidraw_agent_consent_v1';
const DETAIL_KEY = 'kidraw_agent_detail_v1';

/**
 * Agent endpoint configuration and per-graph sharing consent, kept in this
 * browser only. Nothing here ships with a default: until the user adds an
 * endpoint, agent mode never connects anywhere.
 */
@Injectable({providedIn: 'root'})
export class AgentSettingsService {
  get endpoint(): AgentEndpointSettings | null {
    const raw = read(SETTINGS_KEY);
    if (!raw || typeof raw !== 'object') return null;
    const s = raw as Partial<AgentEndpointSettings>;
    if (!s.url || !s.token) return null;
    return {url: s.url, token: s.token, name: s.name || hostOf(s.url), agent: s.agent || 'codex'};
  }

  saveEndpoint(settings: AgentEndpointSettings): void {
    write(SETTINGS_KEY, settings);
  }

  forgetEndpoint(): void {
    try {
      localStorage.removeItem(SETTINGS_KEY);
      localStorage.removeItem(CONSENT_KEY);
    } catch {
      // Storage unavailable — nothing to forget.
    }
  }

  /** How much detail explanations should have; 'standard' until the user picks. */
  get detailLevel(): DetailLevel {
    const raw = read(DETAIL_KEY);
    return DETAIL_LEVELS.includes(raw as DetailLevel) ? raw as DetailLevel : 'standard';
  }

  saveDetailLevel(level: DetailLevel): void {
    write(DETAIL_KEY, level);
  }

  /** Whether this graph may always be shared with the configured endpoint. */
  alwaysShares(graphKey: string): boolean {
    const consent = read(CONSENT_KEY) as Record<string, string> | null;
    const endpoint = this.endpoint;
    return !!endpoint && consent?.[consentId(endpoint.url, graphKey)] === 'always';
  }

  rememberAlwaysShare(graphKey: string): void {
    const endpoint = this.endpoint;
    if (!endpoint) return;
    const consent = (read(CONSENT_KEY) as Record<string, string> | null) ?? {};
    consent[consentId(endpoint.url, graphKey)] = 'always';
    write(CONSENT_KEY, consent);
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function consentId(url: string, graphKey: string): string {
  return `${url}::${graphKey}`;
}

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or disabled storage: settings just won't persist.
  }
}
