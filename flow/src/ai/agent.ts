// What the assistant knows and can do, independent of how Claude is reached.
// Providers (anthropic.ts, artifact.ts) run the conversation; this module owns
// the instructions, the one tool, and checking a proposed change before it lands.

import type { BlockDef } from '../blocks/library';
import type { Snapshot } from '../history/repository';

export const TOOL_NAME = 'apply_changes';

export const TOOL_DESCRIPTION =
  'Replace the diagram and the details with new versions. Pass the COMPLETE new Mermaid source and the COMPLETE new details YAML, ' +
  'plus a one-sentence summary. Returns "Applied." or an error to fix before calling again.';

export const TOOL_SCHEMA = {
  type: 'object' as const,
  properties: {
    diagram: { type: 'string', description: 'The complete new Mermaid flowchart source.' },
    details: { type: 'string', description: 'The complete new details document (YAML).' },
    summary: { type: 'string', description: 'One sentence describing the change, for the user.' },
  },
  required: ['diagram', 'details', 'summary'],
  additionalProperties: false,
};

export interface ProposedChange {
  diagram: string;
  details: string;
  summary: string;
}

/** Thrown from a tool run; the message goes back to Claude so it can fix the change. */
export class ToolError extends Error {
  override name = 'ToolError';
}

/** A failure to show the user (bad key, refusal, network). */
export class AgentError extends Error {
  override name = 'AgentError';
}

/** What a provider needs from the page. */
export interface AgentContext {
  /** The instructions, including the current block library. */
  instructions(): string;
  /** The editors' current contents. */
  workspace(): Snapshot;
  /** Checks a proposed change; returns problems to send back to Claude, or none. */
  check(next: Snapshot): Promise<string[]>;
  /** Puts an accepted change in the editors as an uncommitted change. */
  apply(next: Snapshot, summary: string): void;
}

export interface TurnCallbacks {
  /** The assistant's whole reply so far in this turn. */
  onText(text: string): void;
  /** A change was applied to the editors. */
  onApplied(summary: string): void;
}

export interface AgentProvider {
  /** Shown in the chat header, e.g. "Claude API · claude-opus-5-5". */
  readonly name: string;
  /** Sends one user message and runs until Claude has finished replying. */
  send(message: string, ctx: AgentContext, cb: TurnCallbacks, signal: AbortSignal): Promise<void>;
  /** Forgets the conversation. */
  reset(): void;
}

export function instructions(library: readonly BlockDef[]): string {
  const types = library
    .filter((b) => b.kind === 'node')
    .map((b) => `- ${b.type} (${b.label}): ${b.fields.map((f) => f.key).join(', ') || 'no fields'}`)
    .join('\n');
  const edgeBlocks = library
    .filter((b) => b.kind === 'edge')
    .map((b) => `- ${b.label}: ${b.fields.map((f) => f.key).join(', ')}`)
    .join('\n');
  return `You help a user edit an animated architecture diagram in a web tool. The diagram is a Mermaid flowchart. A separate details document, in YAML, describes its boxes and arrows; the tool shows those details when the user clicks a box or arrow.

How the tool reads the diagram:
- An edge whose label starts with a number ("1. Request", "2a. Retry", "3.1 Sub-step") is a step. Steps play as an animation in number order; edges that share a number play together. Edges without a number are static architecture and always show.
- A comment line "%% 3: text" adds narration to step 3.

The details document has three optional top-level sections:
- types: extra or overridden node types, each { label, color, fields: [key or { key, label }] }.
- nodes: keyed by the node ID used in the diagram. Known keys: type, name, description, deploy (a mapping of deployment facts). Every other key is a parameter of the node's type.
- edges: keyed by a step number ("4") or "From->To" (use From->To when several arrows share a step number). Known keys: method, endpoint, protocol, description, headers, request, response. Other keys are shown as extra sections.

Node types the user has configured, with their parameters:
${types}
Arrow kinds:
${edgeBlocks || '- none'}

Locked objects: a nodes or edges entry with "locked: true" was inserted from the toolbar and must not change. Never change or remove a locked entry, the Mermaid line that declares a locked node, or the line that draws a locked arrow. If a request needs that, say so and change nothing.

How to work:
- To change anything, call ${TOOL_NAME} once with the complete new diagram and the complete new details, and a one-sentence summary. Keep everything you were not asked to change exactly as it was, including comments, ordering and formatting.
- New boxes and arrows should get details entries in the same style as the existing ones.
- If ${TOOL_NAME} returns an error, fix the problem and call it again.
- If the user only asks a question, answer it without calling the tool.
- Reply in one to three short sentences. Do not repeat the diagram or the details in your reply; the user sees the result in the editor.`;
}

/** The user's message, with the editors' current contents for context. */
export function userTurn(message: string, ws: Snapshot): string {
  return `Current diagram:\n<diagram>\n${ws.source}\n</diagram>\n\nCurrent details:\n<details>\n${ws.details}\n</details>\n\nRequest: ${message}`;
}

/** Checks the tool input's shape. The SDK's tolerant parser can return a partial object. */
export function readChange(input: unknown): ProposedChange {
  const r = (input ?? {}) as Record<string, unknown>;
  if (typeof r.diagram !== 'string' || typeof r.details !== 'string' || typeof r.summary !== 'string') {
    throw new ToolError('Invalid input: pass diagram, details and summary, all as strings.');
  }
  if (!r.diagram.trim()) throw new ToolError('The diagram is empty. Pass the complete Mermaid source.');
  return { diagram: r.diagram, details: r.details, summary: r.summary.trim() || 'Updated the diagram.' };
}

/** Runs the tool: validate, then apply. Returns the result text, or throws ToolError for Claude to fix. */
export async function runTool(input: unknown, ctx: AgentContext, cb: TurnCallbacks): Promise<string> {
  const change = readChange(input);
  const next = { source: change.diagram, details: change.details };
  const problems = await ctx.check(next);
  if (problems.length) throw new ToolError(`Not applied. Fix these problems and call ${TOOL_NAME} again:\n- ${problems.join('\n- ')}`);
  ctx.apply(next, change.summary);
  cb.onApplied(change.summary);
  return 'Applied.';
}
