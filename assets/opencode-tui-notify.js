import { execFile } from 'node:child_process';
import { basename } from 'node:path';
import { promisify } from 'node:util';

const NOTIFY_ENDPOINT = `${process.env.OPENCODE_TUI_TUNNEL_URL ?? 'http://127.0.0.1:4096'}/api/opencode-notify`;
const DEDUPE_WINDOW_MS = 1500;
const MANAGED_TMUX_SESSION_PREFIX = 'oct-';
const FALLBACK_PRIMARY_AGENT_NAMES = ['build', 'plan'];
const INTERNAL_PRIMARY_AGENT_NAMES = new Set(['compaction', 'title', 'summary']);

const execFileAsync = promisify(execFile);
const PROJECT_NAME = basename(process.cwd()) || process.cwd();

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

async function getPrimaryAgentNames(api) {
  if (cachedPrimaryAgentNames instanceof Set) {
    return cachedPrimaryAgentNames;
  }

  if (primaryAgentNamesPromise) {
    return primaryAgentNamesPromise;
  }

  primaryAgentNamesPromise = (async () => {
    const sources = [
      { fn: api?.client?.app?.agents, ctx: api?.client?.app },
      { fn: api?.app?.agents, ctx: api?.app },
      { fn: api?.agents, ctx: api },
    ];

    for (const source of sources) {
      if (typeof source.fn !== 'function') {
        continue;
      }

      try {
        const result = await source.fn.call(source.ctx);
        const names = normalizePrimaryAgentNames(normalizeAgentEntries(result));
        if (names.size > 0) {
          cachedPrimaryAgentNames = names;
          return names;
        }
      } catch {
        // Ignore agent registry lookup failures and fall back to known built-ins.
      }
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

async function isStoppedMainAgentAssistantMessageUpdate(api, payload) {
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

  const primaryAgentNames = await getPrimaryAgentNames(api);
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

export default {
  id: 'opencode-tui-tunnel-notify',
  async tui(api) {
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

    const emit = async ({
      type,
      title,
      sessionId,
      permissionId,
      questionId,
      messageId,
      payload,
    }) => {
      const opencodeSessionId = sessionId ?? normalizeSessionId(payload);
      const tmuxSessionName = await getTmuxSessionName();
      const tunnelSessionId = deriveTunnelSessionId(tmuxSessionName);
      const resolvedSessionId = tunnelSessionId ?? opencodeSessionId;

      if (!resolvedSessionId) {
        return;
      }

      const resolvedPermissionId =
        permissionId ??
        (type.startsWith('permission_') ? normalizePermissionId(payload) : null) ??
        null;
      const resolvedQuestionId =
        questionId ?? (type.startsWith('question_') ? normalizeQuestionId(payload) : null) ?? null;
      const resolvedMessageId =
        messageId ?? (type === 'dialog_finished' ? normalizeMessageId(payload) : null) ?? null;

      const dedupeId = resolvedPermissionId ?? resolvedQuestionId ?? resolvedMessageId;
      if (!shouldEmit(type, resolvedSessionId, dedupeId)) {
        return;
      }

      await postToTunnel({
        type,
        title,
        projectName: PROJECT_NAME,
        sessionId: resolvedSessionId,
        opencodeSessionId,
        tmuxSessionName,
        permissionId: resolvedPermissionId,
        questionId: resolvedQuestionId,
        timestamp: new Date().toISOString(),
      });
    };

    const subscribe = (eventName, handler) => {
      const on = api?.event?.on;
      if (typeof on !== 'function') {
        return;
      }

      try {
        on.call(api.event, eventName, async (payload) => {
          try {
            await handler(unwrapEventPayload(payload));
          } catch {
            // Best-effort handlers should not interfere with OpenCode runtime.
          }
        });
      } catch {
        // Ignore unsupported event names for runtime compatibility.
      }
    };

    subscribe('permission.asked', async (payload) => {
      await emit({
        type: 'permission_requested',
        title: 'Permission requested',
        payload,
      });
    });

    subscribe('permission.replied', async (payload) => {
      await emit({
        type: 'permission_resolved',
        title: 'Permission resolved',
        payload,
      });
    });

    subscribe('question.asked', async (payload) => {
      await emit({
        type: 'question_requested',
        title: 'Question requested',
        payload,
      });
    });

    subscribe('question.replied', async (payload) => {
      await emit({
        type: 'question_resolved',
        title: 'Question resolved',
        payload,
      });
    });

    subscribe('message.updated', async (payload) => {
      if (!(await isStoppedMainAgentAssistantMessageUpdate(api, payload))) {
        return;
      }

      await emit({
        type: 'dialog_finished',
        title: 'Dialog finished',
        messageId: normalizeMessageId(payload),
        payload,
      });
    });

    // Fallback path for runtimes without explicit question.* events.
    subscribe('tool.execute.before', async (payload) => {
      const obj = asObject(payload);
      const tool = pickString(obj, ['tool', 'name']);
      if (tool !== 'question') {
        return;
      }

      await emit({
        type: 'question_requested',
        title: 'Question requested',
        sessionId: pickString(obj, ['sessionId', 'sessionID']),
        questionId: pickString(obj, ['callID', 'callId']),
        payload: obj,
      });
    });
  },
};
