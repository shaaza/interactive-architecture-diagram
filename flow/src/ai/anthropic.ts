// The assistant on the Claude API, with the user's own API key, called from the browser.
// A streaming manual tool loop: Claude replies, may call apply_changes, sees the result,
// and finishes. The conversation is append-only so thinking blocks stay valid.

import Anthropic from '@anthropic-ai/sdk';
import type { AiSettings } from './settings';
import { AgentError, runTool, TOOL_DESCRIPTION, TOOL_NAME, TOOL_SCHEMA, ToolError, userTurn, type AgentContext, type AgentProvider, type TurnCallbacks } from './agent';

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type ToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam;

const MAX_ROUNDS = 6;
// Server-side refusal fallback, routed by Anthropic per refusal category.
// Claude Haiku 5.5 has no server-side fallback.
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1', 'claude-opus-5']);

const tools: Anthropic.Beta.Messages.BetaToolUnion[] = [
  {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    input_schema: TOOL_SCHEMA,
    // Large inputs (whole documents) stream as they are generated; readChange() validates them.
    eager_input_streaming: true,
  },
];

/** Turns SDK errors into something to tell the user. */
export function describeApiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'The API key was rejected. Check it in Admin.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'This API key is not allowed to use that model. Choose another model in Admin, or check the key’s workspace.';
  if (err instanceof Anthropic.NotFoundError) return 'That model was not found. Choose another model in Admin.';
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited by the Claude API. Wait a moment and try again.';
  if (err instanceof Anthropic.BadRequestError) return `The Claude API rejected the request: ${err.message}`;
  if (err instanceof Anthropic.InternalServerError) return 'The Claude API had a temporary problem. Try again.';
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the Claude API. Check your connection.';
  if (err instanceof Anthropic.APIError) return `Claude API error ${err.status ?? ''}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

export class AnthropicProvider implements AgentProvider {
  private messages: MessageParam[] = [];
  private readonly client: Anthropic;

  constructor(private readonly settings: AiSettings) {
    this.client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true });
  }

  get name(): string {
    return `Claude API · ${this.settings.model}`;
  }

  reset(): void {
    this.messages = [];
  }

  /** Checks the key and model without spending tokens. */
  async test(): Promise<string> {
    const model = await this.client.models.retrieve(this.settings.model);
    return `Connected. ${model.display_name} is available to this key.`;
  }

  async send(message: string, ctx: AgentContext, cb: TurnCallbacks, signal: AbortSignal): Promise<void> {
    const start = this.messages.length;
    this.messages.push({ role: 'user', content: userTurn(message, ctx.workspace()) });
    // Text from earlier rounds of this turn, and from the round in progress.
    let earlier = '';
    let current = '';
    const join = () => [earlier, current].filter(Boolean).join('\n\n');
    let jsonRetries = 0;
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const fallback = FALLBACK_MODELS.has(this.settings.model);
        const stream = this.client.beta.messages.stream(
          {
            model: this.settings.model,
            max_tokens: 64000,
            system: [{ type: 'text', text: ctx.instructions(), cache_control: { type: 'ephemeral' } }],
            tools,
            messages: this.messages,
            output_config: { effort: this.settings.effort },
            ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
          },
          { signal },
        );
        current = '';
        stream.on('text', (delta) => {
          current += delta;
          cb.onText(join());
        });

        let reply: Anthropic.Beta.Messages.BetaMessage;
        try {
          reply = await stream.finalMessage();
          jsonRetries = 0;
        } catch (err) {
          // Only unparseable tool input is retried; API errors (and aborts) go up.
          if (err instanceof Anthropic.APIError || signal.aborted || jsonRetries++ >= 2) throw err;
          continue;
        }

        earlier = join();
        if (reply.stop_reason === 'refusal') throw new AgentError('Claude declined this request. Try rephrasing it.');
        if (reply.stop_reason === 'pause_turn') {
          this.messages.push({ role: 'assistant', content: reply.content });
          continue;
        }
        const toolUses = reply.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === 'tool_use');
        this.messages.push({ role: 'assistant', content: reply.content });
        if (!toolUses.length) return;
        if (reply.stop_reason === 'max_tokens') {
          throw new AgentError('The change was too large to finish in one reply. Ask for a smaller change.');
        }

        const results: ToolResult[] = [];
        for (const use of toolUses) {
          try {
            if (use.name !== TOOL_NAME) throw new ToolError(`Unknown tool ${use.name}.`);
            results.push({ type: 'tool_result', tool_use_id: use.id, content: await runTool(use.input, ctx, cb) });
          } catch (err) {
            if (!(err instanceof ToolError)) throw err;
            results.push({ type: 'tool_result', tool_use_id: use.id, is_error: true, content: err.message });
          }
        }
        this.messages.push({ role: 'user', content: results });
      }
      throw new AgentError('The assistant took too many steps. Try a simpler request.');
    } catch (err) {
      // Drop the unfinished turn so the next message starts from a clean history.
      this.messages.length = start;
      if (err instanceof AgentError || signal.aborted) throw err;
      throw new AgentError(describeApiError(err));
    }
  }
}
