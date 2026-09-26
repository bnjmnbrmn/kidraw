import { DETAIL_LEVELS, type CanvasRef, type DetailLevel } from './protocol.js';
import { DETAIL_GUIDANCE, SESSION_PREAMBLE, SOURCE_GUIDANCE } from './tools.js';

/**
 * What the agent is told with each of the user's messages, beyond the
 * message itself: the session preamble on the first one (and where KiDraw's
 * source is, when the server has it), the detail level whenever the user
 * changes it, and the nodes and edges the user is pointing at.
 */
export class PromptText {
  private first = true;
  /** The detail level the agent was last told about. */
  private lastDetail: DetailLevel | null = null;

  constructor(private readonly hasSource: boolean) {}

  compose(text: string, refs: CanvasRef[], detail: unknown): string {
    const parts: string[] = [];
    if (this.first) {
      parts.push(SESSION_PREAMBLE, '');
      if (this.hasSource) parts.push(SOURCE_GUIDANCE, '');
      this.first = false;
    }
    // Only when it changes: the agent follows the most recent one.
    if (DETAIL_LEVELS.includes(detail as DetailLevel) && detail !== this.lastDetail) {
      this.lastDetail = detail as DetailLevel;
      parts.push(DETAIL_GUIDANCE[this.lastDetail], '');
    }
    if (refs.length > 0) {
      parts.push('The user is pointing at: ' + refs.map(r => `[[ref:${r.id}|${r.label}]] (${r.kind})`).join(', '), '');
    }
    parts.push(text);
    return parts.join('\n');
  }
}
