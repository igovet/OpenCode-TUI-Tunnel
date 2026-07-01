<script lang="ts">
  import type { SshConnection } from '../lib/types';
  import { createSshConnection, updateSshConnection, testSshConnection, withSilentApiErrors } from '../lib/api';
  import Dialog from './ui/Dialog.svelte';
  import Input from './ui/Input.svelte';
  import Button from './ui/Button.svelte';
  import Badge from './ui/Badge.svelte';
  import Icon from './ui/Icon.svelte';

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
        hadPassphrase = !!connection.passphrase;
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
        const saved = await withSilentApiErrors(() => createSshConnection({
          name: name.trim(),
          host: host.trim(),
          port,
          username: username.trim(),
          authType,
          privateKeyPath: privateKeyPath.trim() || undefined,
          passphrase: passphrase.trim() || undefined,
          opencodeProvider,
          opencodeCommand: opencodeCommand.trim() || undefined,
        }));
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
        result = await withSilentApiErrors(() => updateSshConnection(connection.id, body));
      } else {
        result = await withSilentApiErrors(() => createSshConnection({
          name: name.trim(),
          host: host.trim(),
          port,
          username: username.trim(),
          authType,
          privateKeyPath: privateKeyPath.trim() || undefined,
          passphrase: passphrase.trim() || undefined,
          opencodeProvider,
          opencodeCommand: opencodeProvider === 'server' ? (opencodeCommand.trim() || undefined) : undefined,
        }));
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
</script>

<Dialog
  bind:open
  title={isEditing ? 'Edit SSH Connection' : 'New SSH Connection'}
  size="lg"
  closeOnEscape={!saving && !testing}
  closeOnBackdrop={!saving && !testing}
  onClose={onClose}
>
  {#snippet children()}
    {#if error}
      <div class="form-error" role="alert">{error}</div>
    {/if}

    <div class="form-grid">
      <Input
        label="Name"
        bind:value={name}
        placeholder="e.g. production-server"
        disabled={saving}
      />

      <Input
        label="Host"
        bind:value={host}
        placeholder="e.g. 192.168.1.100 or server.com"
        disabled={saving}
      >
        {#snippet icon()}
          <Icon name="globe" size={16} aria-hidden="true" />
        {/snippet}
      </Input>

      <Input
        label="Port"
        type="number"
        bind:value={port}
        disabled={saving}
        min="1"
        max="65535"
      />

      <Input
        label="Username"
        bind:value={username}
        placeholder="e.g. ubuntu"
        disabled={saving}
      />

      <div class="segment-field">
        <span class="segment-label" id="auth-type-label">Auth Type</span>
        <div class="segment-control" role="radiogroup" aria-labelledby="auth-type-label">
          <button
            type="button"
            class="segment-option"
            class:segment-active={authType === 'key'}
            onclick={() => authType = 'key'}
            disabled={saving}
            role="radio"
            aria-checked={authType === 'key'}
            tabindex={authType === 'key' ? 0 : -1}
          >
            <Icon name="key" size={14} aria-hidden="true" />
            <span>Key</span>
          </button>
          <button
            type="button"
            class="segment-option"
            class:segment-active={authType === 'agent'}
            onclick={() => authType = 'agent'}
            disabled={saving}
            role="radio"
            aria-checked={authType === 'agent'}
            tabindex={authType === 'agent' ? 0 : -1}
          >
            <Icon name="robot" size={14} aria-hidden="true" />
            <span>Agent</span>
          </button>
        </div>
      </div>

      {#if authType === 'key'}
        <Input
          label="Private Key Path"
          bind:value={privateKeyPath}
          placeholder="~/.ssh/id_rsa"
          disabled={saving}
        >
          {#snippet icon()}
            <Icon name="folder" size={16} aria-hidden="true" />
          {/snippet}
        </Input>

        <div class="segment-field passphrase-field">
          <span class="segment-label">Passphrase</span>
          {#if connection && hadPassphrase}
            <div class="passphrase-status">
              <span class="passphrase-indicator">
                <Icon name="key" size={12} aria-hidden="true" />
                Passphrase saved
              </span>
              <button
                type="button"
                class="passphrase-clear-btn"
                onclick={() => { passphrase = ''; hadPassphrase = false; }}
                disabled={saving}
              >
                Clear passphrase
              </button>
            </div>
            <Input
              type="password"
              bind:value={passphrase}
              placeholder="Enter new passphrase to replace"
              disabled={saving}
            />
          {:else}
            <Input
              type="password"
              bind:value={passphrase}
              placeholder="Leave blank if none"
              disabled={saving}
            />
          {/if}
        </div>
      {/if}

      <div class="segment-field">
        <span class="segment-label" id="opencode-provider-label">Opencode Provider</span>
        <div class="segment-control" role="radiogroup" aria-labelledby="opencode-provider-label">
          <button
            type="button"
            class="segment-option"
            class:segment-active={opencodeProvider === 'server'}
            onclick={() => opencodeProvider = 'server'}
            disabled={saving}
            role="radio"
            aria-checked={opencodeProvider === 'server'}
            tabindex={opencodeProvider === 'server' ? 0 : -1}
          >
            <Icon name="globe" size={14} aria-hidden="true" />
            <span>Server</span>
          </button>
          <button
            type="button"
            class="segment-option"
            class:segment-active={opencodeProvider === 'local'}
            onclick={() => opencodeProvider = 'local'}
            disabled={saving}
            role="radio"
            aria-checked={opencodeProvider === 'local'}
            tabindex={opencodeProvider === 'local' ? 0 : -1}
          >
            <Icon name="folder" size={14} aria-hidden="true" />
            <span>Local (SSHFS)</span>
          </button>
        </div>
      </div>

      {#if opencodeProvider === 'server'}
        <Input
          label="Custom Opencode Command (optional)"
          bind:value={opencodeCommand}
          placeholder="e.g. npx opencode"
          disabled={saving}
        >
          {#snippet children()}
            <span class="field-hint">Leave blank to use default: opencode</span>
          {/snippet}
        </Input>
      {:else}
        <div class="sshfs-info">
          <span class="segment-label">Local Mode</span>
          <p class="sshfs-desc">
            The remote directory will be mounted locally via SSHFS,
            and opencode will run on your local machine against
            the mounted files.
          </p>
        </div>
      {/if}
    </div>

    {#if testResult}
      <div class="test-result-wrapper">
        <Badge variant={testResult.success ? 'success' : 'danger'} role="status">
          {testResult.message}
        </Badge>
      </div>
    {/if}
  {/snippet}

  {#snippet footer()}
    <Button variant="ghost" onclick={onClose} disabled={saving || testing}>
      Cancel
    </Button>
    <Button
      variant="secondary"
      onclick={handleTest}
      disabled={saving || testing}
      loading={testing}
    >
      {#snippet icon_src()}
        <Icon name="refresh" size={14} aria-hidden="true" />
      {/snippet}
      Test
    </Button>
    <Button
      variant="primary"
      onclick={handleSave}
      disabled={saving || testing}
      loading={saving}
    >
      Save
    </Button>
  {/snippet}
</Dialog>

<style>
  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  .form-error {
    color: var(--accent-red);
    font-size: var(--font-size-sm);
    padding: var(--space-2);
    background: color-mix(in srgb, var(--accent-red) 10%, transparent);
    border: 1px solid var(--accent-red);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-3);
  }

  /* ── Segment control (pill toggle) ── */
  .segment-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    grid-column: span 2;
  }

  .segment-label {
    font-family: var(--font-ui);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-secondary);
  }

  .segment-control {
    display: flex;
    gap: 0;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: var(--bg-input);
  }

  .segment-option {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1-5);
    padding: var(--space-2) var(--space-3);
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-family: var(--font-ui);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      color var(--transition-fast),
      box-shadow var(--transition-fast);
    white-space: nowrap;
  }

  .segment-option:not(:last-child) {
    border-right: 1px solid var(--border-muted);
  }

  .segment-option.segment-active {
    background: var(--bg-overlay);
    color: var(--text-primary);
    box-shadow: inset 0 0 0 1px var(--border-accent);
  }

  @media (min-width: 769px) {
    .segment-option:hover:not(:disabled):not(.segment-active) {
      background: var(--bg-surface);
      color: var(--text-secondary);
    }
  }

  .segment-option:focus-visible {
    box-shadow: 0 0 0 1px var(--border-accent);
    border-color: var(--border-accent);
  }

  .segment-option:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* ── Passphrase ── */
  .passphrase-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .passphrase-status {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-1);
  }

  .passphrase-indicator {
    font-family: var(--font-ui);
    font-size: var(--font-size-xs);
    color: var(--accent-green);
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .passphrase-clear-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-family: var(--font-ui);
    font-size: var(--font-size-xs);
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
  }

  @media (min-width: 769px) {
    .passphrase-clear-btn:hover:not(:disabled) {
      color: var(--accent-red);
    }
  }

  .passphrase-clear-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* ── SSHFS info ── */
  .sshfs-info {
    grid-column: span 2;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .sshfs-desc {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .field-hint {
    font-family: var(--font-ui);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }

  /* ── Test result ── */
  .test-result-wrapper {
    margin-top: var(--space-2);
  }

  /* ── Responsive ── */
  @media (max-width: 640px) {
    .form-grid {
      grid-template-columns: 1fr;
    }

    .segment-field {
      grid-column: span 1;
    }

    .sshfs-info {
      grid-column: span 1;
    }
  }
</style>
