import { Plugin } from '@opencode-ai/plugin/v2';
import { execFile } from 'node:child_process';
import { basename } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const NOTIFY_ENDPOINT = `${typeof process !== 'undefined' && process.env?.OPENCODE_TUI_TUNNEL_URL ? process.env.OPENCODE_TUI_TUNNEL_URL : 'http://127.0.0.1:4096'}/api/opencode-notify`;
const DEDUPE_WINDOW_MS = 1500;
const MANAGED_TMUX_SESSION_PREFIX = 'oct-';
const FALLBACK_PRIMARY_AGENT_NAMES = ['build', 'plan'];
const INTERNAL_PRIMARY_AGENT_NAMES = new Set(['compaction', 'title', 'summary']);

const PROJECT_NAME = typeof process !== 'undefined' ? basename(process.cwd() || '') || '' : '';

let tmuxSessionNamePromise = null;
let cachedTmuxSessionName;
let primaryAgentNamesPromise = null;
let cachedPrimaryAgentNames;

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function unwrapEventPayload(value) {
  const obj = asObject(value);
  const properties = asObject(obj.properties);
  return Object.keys(properties).length > 0 ? properties : obj;
}

function readString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function pickString(obj, keys) {
  for (const key of keys) {
    const value = readString(obj[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function normalizeSessionId(payload) {
  const obj = unwrapEventPayload(payload);
  return (
    pickString(obj, ['sessionId', 'sessionID']) ??
    pickString(asObject(obj.session), ['id', 'sessionId', 'sessionID'])
  );
}

function normalizePermissionId(payload) {
  const obj = unwrapEventPayload(payload);
  return (
    pickString(obj, ['permissionId', 'permissionID', 'id', 'requestId', 'requestID']) ??
    pickString(asObject(obj.permission), ['id', 'permissionId', 'requestId', 'requestID'])
  );
}

function normalizeQuestionId(payload) {
  const obj = unwrapEventPayload(payload);
  return (
    pickString(obj, [
      'questionId',
      'questionID',
      'id',
      'requestId',
      'requestID',
      'callID',
      'callId',
    ]) ?? pickString(asObject(obj.question), ['id', 'questionId', 'requestId', 'requestID'])
  );
}

function normalizeMessageId(payload) {
  const obj = unwrapEventPayload(payload);
  return (
    pickString(obj, ['messageId', 'messageID']) ??
    pickString(asObject(obj.message), ['id', 'messageId', 'messageID']) ??
    pickString(asObject(obj.info), ['id', 'messageId', 'messageID'])
  );
}

function listMessageAgentNames(message) {
  const names = [];

  for (const key of ['agent', 'mode']) {
    const value = readString(message[key]);
    if (value && !names.includes(value)) {
      names.push(value);
    }
  }

  return names;
}

function normalizeAgentEntries(result) {
  if (Array.isArray(result)) {
    return result;
  }

  const obj = asObject(result);
  if (Array.isArray(obj.data)) {
    return obj.data;
  }

  if (Array.isArray(obj.agents)) {
    return obj.agents;
  }

  const data = asObject(obj.data);
  return Array.isArray(data.agents) ? data.agents : [];
}

function normalizePrimaryAgentNames(entries) {
  const names = new Set();

  for (const entry of entries) {
    const agent = asObject(entry);
    const name = readString(agent.name);
    const mode = readString(agent.mode);

    if (!name || !mode) {
      continue;
    }

    if ((mode === 'primary' || mode === 'all') && !INTERNAL_PRIMARY_AGENT_NAMES.has(name)) {
      names.add(name);
    }
  }

  return names;
}

async function getPrimaryAgentNames(ctx) {
  if (cachedPrimaryAgentNames instanceof Set) {
    return cachedPrimaryAgentNames;
  }

  if (primaryAgentNamesPromise) {
    return primaryAgentNamesPromise;
  }

  primaryAgentNamesPromise = (async () => {
    try {
      const agents = await ctx.agent.list();
      if (agents && agents.length > 0) {
        const names = normalizePrimaryAgentNames(normalizeAgentEntries(agents));
        if (names.size > 0) {
          cachedPrimaryAgentNames = names;
          return names;
        }
      }
    } catch {
      // Ignore agent registry lookup failures and fall back to known built-ins.
    }

    cachedPrimaryAgentNames = new Set(FALLBACK_PRIMARY_AGENT_NAMES);
    return cachedPrimaryAgentNames;
  })();

  try {
    return await primaryAgentNamesPromise;
  } finally {
    primaryAgentNamesPromise = null;
  }
}

async function isStoppedMainAgentAssistantMessageUpdate(ctx, payload) {
  const obj = unwrapEventPayload(payload);
  const message = asObject(obj.info);

  if (message.role !== 'assistant' || message.finish !== 'stop') {
    return false;
  }

  const messageAgentNames = listMessageAgentNames(message).filter(
    (name) => !INTERNAL_PRIMARY_AGENT_NAMES.has(name),
  );
  if (messageAgentNames.length === 0) {
    return false;
  }

  const primaryAgentNames = await getPrimaryAgentNames(ctx);
  return messageAgentNames.some((name) => primaryAgentNames.has(name));
}

function deriveTunnelSessionId(tmuxSessionName) {
  if (
    typeof tmuxSessionName !== 'string' ||
    !tmuxSessionName.startsWith(MANAGED_TMUX_SESSION_PREFIX)
  ) {
    return undefined;
  }

  const tunnelSessionId = tmuxSessionName.slice(MANAGED_TMUX_SESSION_PREFIX.length).trim();
  return tunnelSessionId.length > 0 ? tunnelSessionId : undefined;
}

async function getTmuxSessionName() {
  if (typeof cachedTmuxSessionName === 'string') {
    return cachedTmuxSessionName;
  }

  if (tmuxSessionNamePromise) {
    return tmuxSessionNamePromise;
  }

  tmuxSessionNamePromise = (async () => {
    try {
      const { stdout } = await execFileAsync('tmux', ['display-message', '-p', '#S']);
      const sessionName = readString(stdout);
      if (sessionName) {
        cachedTmuxSessionName = sessionName;
      }
      return sessionName;
    } catch {
      return undefined;
    } finally {
      tmuxSessionNamePromise = null;
    }
  })();

  return tmuxSessionNamePromise;
}

async function postToTunnel(payload) {
  try {
    await fetch(NOTIFY_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Backend unavailable should never crash OpenCode plugin execution.
  }
}

export default Plugin.define({
  id: 'opencode-tui-tunnel-notify',
  setup: async (ctx) => {
    const recentEmits = new Map();

    const shouldEmit = (type, sessionId, id) => {
      const key = `${type}:${sessionId ?? 'unknown'}:${id ?? 'none'}`;
      const now = Date.now();
      const previous = recentEmits.get(key);

      if (typeof previous === 'number' && now - previous < DEDUPE_WINDOW_MS) {
        return false;
      }

      recentEmits.set(key, now);

      for (const [entry, timestamp] of recentEmits) {
        if (now - timestamp > DEDUPE_WINDOW_MS * 2) {
          recentEmits.delete(entry);
        }
      }

      return true;
    };

    const emit = async (eventName, rawPayload) => {
      try {
        const payload = unwrapEventPayload(rawPayload);
        if (!payload) return;

        const tmuxSessionName = await getTmuxSessionName();
        const tunnelSessionId = deriveTunnelSessionId(tmuxSessionName);
        if (!tunnelSessionId) return;

        const primaryAgentNames = await getPrimaryAgentNames(ctx);

        let normalized;
        switch (eventName) {
          case 'permission_requested':
          case 'permission_resolved': {
            const permissionId = normalizePermissionId(payload);
            if (!permissionId || !shouldEmit(eventName, tunnelSessionId, permissionId)) return;
            normalized = {
              type: eventName,
              sessionId: tunnelSessionId,
              permissionId,
              projectName: PROJECT_NAME,
              tmuxSessionName,
              timestamp: new Date().toISOString(),
            };
            break;
          }
          case 'question_requested':
          case 'question_resolved': {
            const questionId = normalizeQuestionId(payload);
            if (!questionId || !shouldEmit(eventName, tunnelSessionId, questionId)) return;
            normalized = {
              type: eventName,
              sessionId: tunnelSessionId,
              questionId,
              projectName: PROJECT_NAME,
              tmuxSessionName,
              timestamp: new Date().toISOString(),
            };
            break;
          }
          case 'dialog_finished': {
            const messageId = normalizeMessageId(payload);
            if (!messageId || !shouldEmit(eventName, tunnelSessionId, messageId)) return;
            if (!(await isStoppedMainAgentAssistantMessageUpdate(ctx, rawPayload))) return;
            normalized = {
              type: eventName,
              sessionId: tunnelSessionId,
              messageId,
              projectName: PROJECT_NAME,
              tmuxSessionName,
              timestamp: new Date().toISOString(),
            };
            break;
          }
          default:
            return;
        }

        await postToTunnel(normalized);
      } catch {
        // Best-effort notification should never crash OpenCode plugin execution.
      }
    };

    // Subscribe to events using V2 API
    await ctx.event.subscribe('permission.asked', (p) => emit('permission_requested', p));
    await ctx.event.subscribe('permission.replied', (p) => emit('permission_resolved', p));
    await ctx.event.subscribe('question.asked', (p) => emit('question_requested', p));
    await ctx.event.subscribe('question.replied', (p) => emit('question_resolved', p));
    await ctx.event.subscribe('message.updated', (p) => emit('dialog_finished', p));

    // Tool hook for question fallback (runtimes without explicit question.* events)
    await ctx.tool.hook('execute.before', (p) => {
      const obj = asObject(p);
      const tool = pickString(obj, ['tool', 'name']);
      if (tool !== 'question') return;
      emit('question_requested', p);
    });

    // Return cleanup function
    return async () => {
      recentEmits.clear();
    };
  },
});
