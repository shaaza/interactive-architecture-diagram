// The assistant chat: a button at the bottom right that opens a panel where the
// user asks for changes. The provider does the talking; this module is the UI.

import { AgentError, type AgentContext, type AgentProvider } from '../ai/agent';
import { byId, h } from './dom';

export interface ChatOptions {
  context: AgentContext;
  /** The provider to use now, or null with a reason when none is set up. */
  getProvider(): Promise<{ provider: AgentProvider } | { provider: null; reason: string }>;
  openAdmin(): void;
}

export interface Chat {
  /** Forget the conversation, e.g. after the provider settings change. */
  reset(): void;
}

export function createChat({ context, getProvider, openAdmin }: ChatOptions): Chat {
  const launcher = byId('chatLauncher', HTMLButtonElement);
  const panel = byId('chatPanel', HTMLElement);
  const log = byId('chatLog', HTMLElement);
  const form = byId('chatForm', HTMLFormElement);
  const input = byId('chatInput', HTMLTextAreaElement);
  const send = byId('chatSend', HTMLButtonElement);
  const stop = byId('chatStop', HTMLButtonElement);
  const via = byId('chatVia', HTMLElement);
  let provider: AgentProvider | null = null;
  let running: AbortController | null = null;

  function scroll(): void {
    log.scrollTop = log.scrollHeight;
  }

  function add(kind: 'user' | 'assistant' | 'note' | 'error', text: string): HTMLElement {
    const el = h('div', { class: `msg msg-${kind}` }, text);
    log.append(el);
    scroll();
    return el;
  }

  function emptyState(): void {
    log.replaceChildren(
      h(
        'div',
        { class: 'chat-empty' },
        h('p', {}, 'Ask for a change and the assistant edits the diagram and details for you. For example:'),
        ...['Add a Redis cache between the gateway and the order service, as step 5', 'Give every service an owner and a deploy section', 'Explain what happens in step 4'].map((example) => {
          const b = h('button', { type: 'button', class: 'chat-example' }, example);
          b.addEventListener('click', () => {
            input.value = example;
            input.focus();
          });
          return b;
        }),
        h('p', { class: 'chat-fine' }, 'Changes arrive as uncommitted edits. Commit them to keep them, or roll back.'),
      ),
    );
  }

  async function refreshProvider(): Promise<boolean> {
    const found = await getProvider();
    provider = found.provider;
    if (found.provider) {
      via.textContent = found.provider.name;
      return true;
    }
    via.textContent = 'Not set up';
    const setup = h('div', { class: 'msg msg-setup' }, found.reason, ' ');
    const link = h('button', { type: 'button', class: 'linklike' }, 'Open Admin');
    link.addEventListener('click', openAdmin);
    setup.append(link);
    log.replaceChildren(setup);
    return false;
  }

  function setRunning(on: boolean): void {
    send.hidden = on;
    stop.hidden = !on;
    input.disabled = on;
  }

  async function submit(): Promise<void> {
    const message = input.value.trim();
    if (!message || running) return;
    if (!provider && !(await refreshProvider())) return;
    if (!provider) return;
    log.querySelector('.chat-empty')?.remove();
    add('user', message);
    input.value = '';
    // Each applied change splits the reply: text before it, the "Applied" note, text after it.
    let reply = add('assistant', 'Thinking…');
    reply.classList.add('pending');
    let latest = '';
    let offset = 0;
    running = new AbortController();
    setRunning(true);
    try {
      await provider.send(
        message,
        context,
        {
          onText: (text) => {
            latest = text;
            const part = text.slice(offset).trim();
            if (!part) return;
            reply.classList.remove('pending');
            reply.textContent = part;
            scroll();
          },
          onApplied: (summary) => {
            if (reply.classList.contains('pending')) reply.remove();
            add('note', `Applied: ${summary}`);
            offset = latest.length;
            reply = add('assistant', 'Working…');
            reply.classList.add('pending');
          },
        },
        running.signal,
      );
      if (reply.classList.contains('pending')) reply.remove();
    } catch (err) {
      if (running?.signal.aborted) {
        if (reply.classList.contains('pending')) reply.remove();
        add('note', 'Stopped.');
      } else {
        if (reply.classList.contains('pending')) reply.remove();
        add('error', err instanceof AgentError ? err.message : String(err));
      }
    } finally {
      reply.classList.remove('pending');
      running = null;
      setRunning(false);
      input.focus();
    }
  }

  function open(on: boolean): void {
    panel.hidden = !on;
    launcher.setAttribute('aria-expanded', String(on));
    if (on) {
      void refreshProvider().then((ok) => {
        if (ok && !log.children.length) emptyState();
      });
      input.focus();
    }
  }

  launcher.addEventListener('click', () => open(panel.hidden));
  byId('chatClose', HTMLButtonElement).addEventListener('click', () => open(false));
  byId('chatNew', HTMLButtonElement).addEventListener('click', () => {
    running?.abort();
    provider?.reset();
    emptyState();
  });
  stop.addEventListener('click', () => running?.abort());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void submit();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !running) open(false);
  });

  return {
    reset() {
      running?.abort();
      provider = null;
      log.replaceChildren();
    },
  };
}
