// The assistant inside a claude.ai artifact, where the page cannot reach the
// Claude API directly. It uses the viewer's own Claude account through the
// artifact runtime's `sample` capability, with apply_changes as a page tool.

import type { AiSettings } from './settings';
import { AgentError, runTool, TOOL_DESCRIPTION, TOOL_NAME, TOOL_SCHEMA, ToolError, userTurn, type AgentContext, type AgentProvider, type TurnCallbacks } from './agent';

interface SampleMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SampleTool {
  name: string;
  description: string;
  inputSchema?: { type: 'object'; [k: string]: unknown };
  execute(input: Record<string, unknown>, context: { signal: AbortSignal }): unknown;
}

interface SampleOptions {
  onText?: (u: { text: string; delta: string }) => void;
  signal?: AbortSignal;
  tools?: SampleTool[];
  model?: string;
  effort?: 'low' | 'medium' | 'high';
  cache?: boolean;
}

type Sample = (input: string | SampleMessage[], options?: SampleOptions) => Promise<{ text: string; truncated: boolean }>;

interface SampleError {
  code: string;
  message: string;
  text?: string;
}

declare global {
  interface Window {
    claude?: { use(name: 'sample'): Promise<Sample | null> };
  }
}

/** Resolves the sample capability when the page runs inside a Claude viewer, else null. */
export async function findSample(): Promise<Sample | null> {
  try {
    return (await window.claude?.use('sample')) ?? null;
  } catch {
    return null;
  }
}

const ERRORS: Record<string, string> = {
  not_granted: 'The assistant needs permission to use Claude in this artifact. Allow it when asked, or reopen the artifact.',
  sampling_disabled: 'Claude is not available for this account here.',
  rate_limited: 'Too many requests, or a usage limit was reached. Try again later.',
  session_expired: 'Sign in to Claude again, then retry.',
  refused: 'Claude declined this request. Try rephrasing it.',
  prompt_too_large: 'The diagram and conversation are too large. Start a new chat or ask for less.',
  tools_unavailable: 'This Claude app cannot run the assistant’s editing tool. Try the web version.',
  empty_completion: 'Claude returned no reply. Try rephrasing the request.',
};

/** Keeps the instructions turn plus this many recent turns, to stay under the input limit. */
const KEEP_TURNS = 8;

export class ArtifactProvider implements AgentProvider {
  private turns: SampleMessage[] = [];

  constructor(
    private readonly sample: Sample,
    private readonly settings: AiSettings,
  ) {}

  get name(): string {
    return `Your Claude account · ${this.settings.model}`;
  }

  reset(): void {
    this.turns = [];
  }

  async send(message: string, ctx: AgentContext, cb: TurnCallbacks, signal: AbortSignal): Promise<void> {
    // The capability takes effort up to "high".
    const effort = this.settings.effort === 'low' || this.settings.effort === 'medium' ? this.settings.effort : 'high';
    const turn: SampleMessage = { role: 'user', content: userTurn(message, ctx.workspace()) };
    const history = this.turns.slice(-KEEP_TURNS);
    try {
      const { text, truncated } = await this.sample([{ role: 'user', content: ctx.instructions() }, ...history, turn], {
        signal,
        model: this.settings.model,
        effort,
        onText: ({ text }) => cb.onText(text),
        tools: [
          {
            name: TOOL_NAME,
            description: TOOL_DESCRIPTION,
            inputSchema: TOOL_SCHEMA,
            // A thrown error goes back to Claude as the result, so it can fix the change.
            execute: async (input, context) => {
              if (context.signal.aborted) throw new Error('Stopped.');
              try {
                return await runTool(input, ctx, cb);
              } catch (err) {
                throw new Error(err instanceof ToolError ? err.message : String(err));
              }
            },
          },
        ],
      });
      // Only the text is kept: earlier diagrams in old turns would just use up the input limit.
      this.turns.push({ role: 'user', content: message }, { role: 'assistant', content: text + (truncated ? ' (cut short)' : '') });
    } catch (err) {
      if (signal.aborted) throw err;
      const e = err as SampleError;
      throw new AgentError(ERRORS[e?.code] ?? `The assistant could not finish (${e?.code ?? 'error'}). Try again.`);
    }
  }
}
