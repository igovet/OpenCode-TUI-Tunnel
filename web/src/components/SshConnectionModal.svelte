<script lang="ts">
  import type { SshConnection } from '../lib/types';
  import { createSshConnection, updateSshConnection, testSshConnection } from '../lib/api';

  let {
    open,
    connection,
    onClose,
    onSaved,
  } = $props<{
    open: boolean;
    connection?: SshConnection;
    onClose: () => void;
    onSaved: (conn: SshConnection) => void;
  }>();

  let name = $state('');
  let host = $state('');
  let port = $state(22);
  let username = $state('');
  let authType = $state<'key' | 'agent'>('key');
  let privateKeyPath = $state('');
  let passphrase = $state('');
  let opencodeProvider = $state<'local' | 'server'>('server');
  let opencodeCommand = $state('');

  let testing = $state(false);
  let testResult = $state<{ success: boolean; message: string } | null>(null);
  let saving = $state(false);
  let error = $state<string | null>(null);

  // Track if connection had passphrase when modal opened (for edit mode)
  let hadPassphrase = $state(false);

  // Reset form when modal opens with a connection to edit
  $effect(() => {
    if (open) {
      if (connection) {
        name = connection.name;
        host = connection.host;
        port = connection.port;
        username = connection.username;
        authType = connection.authType;
        privateKeyPath = connection.privateKeyPath ?? '';
        passphrase = '';
        hadPassphrase = !!connection.passphrase; // Track if passphrase was saved
        opencodeProvider = connection.opencodeProvider ?? 'server';
        opencodeCommand = connection.opencodeCommand ?? '';
      } else {
        name = '';
        host = '';
        port = 22;
        username = '';
        authType = 'key';
        privateKeyPath = '';
        passphrase = '';
        hadPassphrase = false;
        opencodeProvider = 'server';
        opencodeCommand = '';
      }
      testing = false;
      testResult = null;
      saving = false;
      error = null;
    }
  });

  const isEditing = $derived(!!connection);

  function validate(): string | null {
    if (!name.trim()) return 'Name is required';
    if (!host.trim()) return 'Host is required';
    if (port < 1 || port > 65535) return 'Port must be between 1 and 65535';
    if (!username.trim()) return 'Username is required';
    if (authType === 'key' && !privateKeyPath.trim()) return 'Private key path is required for key auth';
    return null;
  }

  async function handleTest() {
    const validationError = validate();
    if (validationError) {
      error = validationError;
      return;
    }
    error = null;
    testing = true;
    testResult = null;
    try {
      let id: string | undefined = connection?.id;
      if (!id) {
        // Need to save first to get an ID for testing
        const saved = await createSshConnection({
          name: name.trim(),
          host: host.trim(),
          port,
          username: username.trim(),
          authType,
          privateKeyPath: privateKeyPath.trim() || undefined,
          passphrase: passphrase.trim() || undefined,
          opencodeProvider,
          opencodeCommand: opencodeCommand.trim() || undefined,
        });
        id = saved.id;
        onSaved(saved);
      }
      const result = await testSshConnection(id);
      testResult = {
        success: result.success,
        message: result.success ? 'Connection successful' : (result.error ?? 'Connection failed'),
      };
    } catch (e: unknown) {
      const err = e as Error & { statusCode?: number };
      testResult = { success: false, message: err.message ?? 'Test failed' };
    } finally {
      testing = false;
    }
  }

  async function handleSave() {
    const validationError = validate();
    if (validationError) {
      error = validationError;
      return;
    }
    error = null;
    saving = true;
    try {
      let result: SshConnection;
      if (connection) {
        const body: Parameters<typeof updateSshConnection>[1] = {
          name: name.trim(),
          host: host.trim(),
          port,
          username: username.trim(),
          authType,
          opencodeProvider,
        };
        if (privateKeyPath.trim()) {
          body.privateKeyPath = privateKeyPath.trim();
        } else {
          body.privateKeyPath = null;
        }
        if (passphrase.trim()) {
          body.passphrase = passphrase.trim();
        } else if (hadPassphrase) {
          // User left empty but there was a saved passphrase - explicitly clear it
          body.passphrase = null;
        }
        // else: don't include passphrase in body (keep existing)
        if (opencodeProvider === 'server' && opencodeCommand.trim()) {
          body.opencodeCommand = opencodeCommand.trim();
        } else {
          body.opencodeCommand = null;
        }
        result = await updateSshConnection(connection.id, body);
      } else {
        result = await createSshConnection({
          name: name.trim(),
          host: host.trim(),
          port,
          username: username.trim(),
          authType,
          privateKeyPath: privateKeyPath.trim() || undefined,
          passphrase: passphrase.trim() || undefined,
          opencodeProvider,
          opencodeCommand: opencodeProvider === 'server' ? (opencodeCommand.trim() || undefined) : undefined,
        });
      }
      onSaved(result);
      onClose();
    } catch (e: unknown) {
      const err = e as Error & { statusCode?: number };
      error = err.message ?? 'Failed to save';
    } finally {
      saving = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !saving && !testing) {
      onClose();
    }
  }
</script>

{#if open}
  <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="ssh-modal-title" onclick={() => !saving && !testing && onClose()}>
    <div class="modal-box" onclick={(e) => e.stopPropagation()} onkeydown={handleKeydown}>
      <h2 id="ssh-modal-title" class="modal-title">[ {isEditing ? 'EDIT' : 'NEW'} SSH CONNECTION ]</h2>

      {#if error}
        <div class="form-error" role="alert">{error}</div>
      {/if}

      <div class="form-grid">
        <label class="form-field">
          <span class="field-label">Name</span>
          <input type="text" bind:value={name} placeholder="e.g. production-server" disabled={saving} />
        </label>

        <label class="form-field">
          <span class="field-label">Host</span>
          <input type="text" bind:value={host} placeholder="e.g. 192.168.1.100 or server.com" disabled={saving} />
        </label>

        <label class="form-field">
          <span class="field-label">Port</span>
          <input type="number" bind:value={port} min="1" max="65535" disabled={saving} />
        </label>

        <label class="form-field">
          <span class="field-label">Username</span>
          <input type="text" bind:value={username} placeholder="e.g. ubuntu" disabled={saving} />
        </label>

        <div class="form-field auth-toggle">
          <span class="field-label">Auth Type</span>
          <div class="auth-options">
            <button
              type="button"
              class="auth-btn"
              class:selected={authType === 'key'}
              onclick={() => authType = 'key'}
              disabled={saving}
            >
              SSH Key
            </button>
            <button
              type="button"
              class="auth-btn"
              class:selected={authType === 'agent'}
              onclick={() => authType = 'agent'}
              disabled={saving}
            >
              Agent
            </button>
          </div>
        </div>

        {#if authType === 'key'}
          <label class="form-field">
            <span class="field-label">Private Key Path</span>
            <input type="text" bind:value={privateKeyPath} placeholder="~/.ssh/id_rsa" disabled={saving} />
          </label>

          <label class="form-field passphrase-field">
            <span class="field-label">Passphrase</span>
            {#if connection && hadPassphrase}
              <div class="passphrase-status">
                <span class="passphrase-indicator">🔒 Passphrase saved</span>
                <button
                  type="button"
                  class="passphrase-clear-btn"
                  onclick={() => { passphrase = ''; hadPassphrase = false; }}
                  disabled={saving}
                >
                  Clear passphrase
                </button>
              </div>
              <input type="password" bind:value={passphrase} placeholder="Enter new passphrase to replace" disabled={saving} />
            {:else}
              <input type="password" bind:value={passphrase} placeholder="Leave blank if none" disabled={saving} />
            {/if}
          </label>
        {/if}

        <div class="form-field provider-toggle">
          <span class="field-label">Opencode Provider</span>
          <div class="provider-options">
            <button
              type="button"
              class="provider-btn"
              class:selected={opencodeProvider === 'server'}
              onclick={() => opencodeProvider = 'server'}
              disabled={saving}
            >
              🌐 Server
            </button>
            <button
              type="button"
              class="provider-btn"
              class:selected={opencodeProvider === 'local'}
              onclick={() => opencodeProvider = 'local'}
              disabled={saving}
            >
              📁 Local (SSHFS)
            </button>
          </div>
        </div>

        {#if opencodeProvider === 'server'}
          <label class="form-field">
            <span class="field-label">Custom Opencode Command (optional)</span>
            <input type="text" bind:value={opencodeCommand} placeholder="e.g. npx opencode" disabled={saving} />
            <span class="field-hint">Leave blank to use default: opencode</span>
          </label>
        {:else}
          <div class="form-field sshfs-info">
            <span class="field-label">Local Mode</span>
            <p class="sshfs-desc">
              The remote directory will be mounted locally via SSHFS,
              and opencode will run on your local machine against
              the mounted files.
            </p>
          </div>
        {/if}
      </div>

      {#if testResult}
        <div class="test-result" class:success={testResult.success} class:failure={!testResult.success} role="status">
          {testResult.message}
        </div>
      {/if}

      <div class="modal-actions">
        <button class="btn modal-cancel" onclick={onClose} disabled={saving || testing}>CANCEL</button>
        <button class="btn modal-test" onclick={handleTest} disabled={saving || testing}>
          {testing ? 'TESTING...' : 'TEST'}
        </button>
        <button class="btn primary modal-save" onclick={handleSave} disabled={saving || testing}>
          {saving ? 'SAVING...' : 'SAVE'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: var(--space-4);
  }

  .modal-box {
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: 0;
    padding: var(--space-6);
    max-width: 520px;
    width: 100%;
    box-sizing: border-box;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .modal-title {
    margin: 0;
    font-size: var(--font-size-md);
    font-weight: 700;
    color: var(--accent-cyan);
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .form-field input {
    background: var(--bg-base);
    border: 1px solid var(--border-default);
    color: var(--text-primary);
    padding: var(--space-2) var(--space-3);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    border-radius: 0;
    outline: none;
  }

  .form-field input:focus {
    border-color: var(--accent-blue);
  }

  .form-field input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .field-label {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .auth-toggle {
    grid-column: span 2;
  }

  .auth-options {
    display: flex;
    gap: var(--space-2);
  }

  .auth-btn {
    flex: 1;
    padding: var(--space-2) var(--space-3);
    background: var(--bg-base);
    border: 1px solid var(--border-default);
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    cursor: pointer;
    border-radius: 0;
  }

  .auth-btn.selected {
    border-color: var(--accent-blue);
    color: var(--accent-blue);
    background: rgba(88, 166, 255, 0.1);
  }

  .auth-btn:hover:not(:disabled) {
    border-color: var(--accent-blue);
  }

  .auth-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .form-error {
    color: var(--accent-red);
    font-size: var(--font-size-sm);
    padding: var(--space-2);
    background: rgba(248, 81, 73, 0.1);
    border: 1px solid var(--accent-red);
  }

  .test-result {
    font-size: var(--font-size-sm);
    padding: var(--space-2);
    border: 1px solid;
  }

  .test-result.success {
    color: var(--accent-green);
    background: rgba(63, 185, 80, 0.1);
    border-color: var(--accent-green);
  }

  .test-result.failure {
    color: var(--accent-red);
    background: rgba(248, 81, 73, 0.1);
    border-color: var(--accent-red);
  }

  .modal-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
    margin-top: var(--space-2);
  }

  .modal-cancel {
    background: transparent;
    border: 1px solid var(--border-default);
    color: var(--text-muted);
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 0;
    cursor: pointer;
    font-family: var(--font-mono);
  }

  .modal-cancel:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .modal-test {
    background: var(--bg-elevated);
    border: 1px solid var(--accent-cyan);
    color: var(--accent-cyan);
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 0;
    cursor: pointer;
    font-family: var(--font-mono);
  }

  .modal-test:hover:not(:disabled) {
    background: rgba(34, 211, 238, 0.1);
  }

  .modal-test:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .modal-save {
    background: var(--accent-green);
    border: 1px solid var(--accent-green);
    color: var(--bg-base);
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 0;
    cursor: pointer;
    font-family: var(--font-mono);
    font-weight: 700;
  }

  .modal-save:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .modal-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .provider-toggle {
    grid-column: span 2;
  }

  .provider-options {
    display: flex;
    gap: var(--space-2);
  }

  .provider-btn {
    flex: 1;
    padding: var(--space-2) var(--space-3);
    background: var(--bg-base);
    border: 1px solid var(--border-default);
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    cursor: pointer;
    border-radius: 0;
  }

  .provider-btn.selected {
    border-color: var(--accent-green);
    color: var(--accent-green);
    background: rgba(63, 185, 80, 0.1);
  }

  .provider-btn:hover:not(:disabled) {
    border-color: var(--accent-green);
  }

  .provider-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .field-hint {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    margin-top: 2px;
  }

  .sshfs-info {
    grid-column: span 2;
  }

  .passphrase-field {
    grid-column: span 2;
  }

  .passphrase-status {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-1);
  }

  .passphrase-indicator {
    font-size: var(--font-size-xs);
    color: var(--accent-green);
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .passphrase-clear-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
  }

  .passphrase-clear-btn:hover:not(:disabled) {
    color: var(--accent-red);
  }

  .passphrase-clear-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .sshfs-desc {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    line-height: 1.5;
  }

  @media (max-width: 640px) {
    .form-grid {
      grid-template-columns: 1fr;
    }
    .auth-toggle {
      grid-column: span 1;
    }
    .provider-toggle {
      grid-column: span 1;
    }
    .sshfs-info {
      grid-column: span 1;
    }
    .passphrase-field {
      grid-column: span 1;
    }
    .modal-box {
      padding: var(--space-4);
    }
  }

  @media (max-width: 768px) {
    button:hover,
    button:focus,
    button:focus-visible,
    .auth-btn:hover,
    .auth-btn:focus,
    .auth-btn:focus-visible,
    .provider-btn:hover,
    .provider-btn:focus,
    .provider-btn:focus-visible,
    .modal-cancel:hover,
    .modal-cancel:focus,
    .modal-cancel:focus-visible,
    .modal-test:hover,
    .modal-test:focus,
    .modal-test:focus-visible,
    .modal-save:hover,
    .modal-save:focus,
    .modal-save:focus-visible {
      outline: none;
      background: inherit;
      color: inherit;
      border-color: inherit;
      box-shadow: none;
    }
  }
</style>
