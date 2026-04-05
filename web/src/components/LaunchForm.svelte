<script lang="ts">
  import { launchSession } from '../lib/api'
  
  let { onSuccess, onCancel }: { onSuccess: (id: string) => void, onCancel: () => void } = $props()
  
  let cwd = $state('')
  let loading = $state(false)
  let error = $state('')
  
  async function submit() {
    if (!cwd.trim()) {
      error = 'Working directory is required'
      return
    }
    
    loading = true
    error = ''
    try {
      const { session } = await launchSession(cwd, 80, 24)
      onSuccess(session.id)
    } catch (e) {
      error = e.message
    } finally {
      loading = false
    }
  }
</script>

<div class="form">
  <h2>Launch opencode</h2>
  
  <div class="input-group">
    <label for="cwd">Working Directory</label>
    <input 
      id="cwd"
      type="text" 
      bind:value={cwd} 
      placeholder="~/Projects/my-app"
      disabled={loading}
    />
  </div>
  
  {#if error}
    <div class="error">{error}</div>
  {/if}
  
  <div class="actions">
    <button type="button" class="secondary" onclick={onCancel} disabled={loading}>Cancel</button>
    <button type="submit" class="primary" onclick={submit} disabled={loading}>
      {loading ? 'Launching...' : 'Launch'}
    </button>
  </div>
</div>

<style>
  .form {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 500px;
    margin: 0 auto;
  }
  
  h2 {
    margin: 0 0 8px 0;
    font-size: 1.25rem;
    color: #e6edf3;
  }
  
  .input-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  label {
    font-size: 0.9rem;
    font-weight: 600;
    color: #c9d1d9;
  }
  
  input {
    background: #0d1117;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 1rem;
    outline: none;
  }
  
  input:focus {
    border-color: #58a6ff;
  }
  
  .error {
    color: #f85149;
    font-size: 0.9rem;
  }
  
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }
  
  button {
    padding: 6px 16px;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid rgba(240,246,252,0.1);
  }
  
  button.primary {
    background: #238636;
    color: #ffffff;
  }
  
  button.primary:hover:not(:disabled) {
    background: #2ea043;
  }
  
  button.secondary {
    background: #21262d;
    color: #c9d1d9;
  }
  
  button.secondary:hover:not(:disabled) {
    background: #30363d;
    border-color: #8b949e;
  }
  
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
