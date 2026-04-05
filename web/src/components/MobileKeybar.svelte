<script lang="ts">
  import { KEY_GROUPS, KEY_SEQUENCES } from '../lib/opencode-keybinds';
  
  // Terminal write function
  let { write = () => {} }: { write?: (data: string) => void } = $props();
  
  let activeGroup = $state(0);
  let expanded = $state(false);
  let activeModifier = $state<'ctrl' | 'alt' | 'shift' | null>(null);

  const stickyModifiers = [
    { id: 'ctrl' as const, label: 'CTRL' },
    { id: 'alt' as const, label: 'ALT' },
    { id: 'shift' as const, label: 'SHIFT' },
  ];

  const quickCombos = [
    { label: 'C-j', key: KEY_SEQUENCES['ctrl+j'], description: 'Ctrl+J / Newline (confirm)' },
    { label: 'C-c', key: KEY_SEQUENCES['ctrl+c'], description: 'Ctrl+C / Cancel' },
    { label: 'C-d', key: KEY_SEQUENCES['ctrl+d'], description: 'Ctrl+D / Quit' },
    { label: 'C-l', key: KEY_SEQUENCES['ctrl+l'], description: 'Ctrl+L / Clear screen' },
    { label: 'C-u', key: KEY_SEQUENCES['ctrl+u'], description: 'Ctrl+U / Delete line' },
    { label: 'C-w', key: KEY_SEQUENCES['ctrl+w'], description: 'Ctrl+W / Delete word' },
    { label: 'C-a', key: KEY_SEQUENCES['ctrl+a'], description: 'Ctrl+A / Start of line' },
    { label: 'C-e', key: KEY_SEQUENCES['ctrl+e'], description: 'Ctrl+E / End of line' },
  ];

  const ctrlLetterPad = 'abcdefghijklmnopqrstuvwxyz'.split('');
  
  function toggleExpanded() { expanded = !expanded; }

  function isModifierActive(mod: 'ctrl' | 'alt' | 'shift'): boolean {
    return activeModifier === mod;
  }
  
  function toggleModifier(mod: 'ctrl' | 'alt' | 'shift') {
    const next = activeModifier === mod ? null : mod;
    activeModifier = next;
    if (next === 'ctrl') {
      expanded = true;
    }
  }

  function ctrlChar(letter: string): string {
    const code = letter.toUpperCase().charCodeAt(0) - 64;
    return String.fromCharCode(Math.max(1, code));
  }

  function sendSequence(sequence: string | undefined) {
    if (!sequence) return;
    write(sequence);
    activeModifier = null;
  }
  
  function sendKey(key: string) {
    let finalKey = key;

    if (activeModifier === 'ctrl' && key.length === 1 && /[a-zA-Z]/.test(key)) {
      finalKey = ctrlChar(key);
    } else if (activeModifier === 'shift' && key.length === 1 && /[a-z]/.test(key)) {
      finalKey = key.toUpperCase();
    }

    if (activeModifier === 'alt') {
      finalKey = `\x1b${finalKey}`;
    }

    write(finalKey);
    activeModifier = null;
  }

  function sendDefinedKey(key: string | undefined) {
    if (!key) return;
    sendKey(key);
  }

  function sendLetter(letter: string) {
    sendKey(letter);
  }
</script>

<div class="keybar" class:expanded>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="keybar-header" onclick={toggleExpanded}>
    <div class="keybar-groups">
      {#each KEY_GROUPS as group, i}
        <button 
          class="group-tab" 
          class:active={activeGroup === i}
          onclick={(e) => { e.stopPropagation(); activeGroup = i; expanded = true; }}
        >{group.name}</button>
      {/each}
    </div>
    <button class="expand-toggle">{expanded ? '▼' : '▲'}</button>
  </div>

  <div class="modifier-row">
    {#each stickyModifiers as mod}
      <button
        class="mod-btn"
        class:active={isModifierActive(mod.id)}
        title={`Toggle ${mod.label}`}
        onclick={() => toggleModifier(mod.id)}
      >
        {mod.label}
      </button>
    {/each}
  </div>

  <div class="sticky-row">
    {#each quickCombos as combo}
      <button
        class="key-btn quick-combo"
        title={combo.description}
        onclick={() => sendSequence(combo.key)}
      >
        {combo.label}
      </button>
    {/each}
  </div>
  
  {#if expanded}
    {#if isModifierActive('ctrl')}
      <div class="ctrl-letter-pad">
        {#each ctrlLetterPad as letter}
          <button class="key-btn letter-btn" onclick={() => sendLetter(letter)}>
            {letter}
          </button>
        {/each}
      </div>
    {/if}

    <div class="keybar-keys">
      {#each KEY_GROUPS[activeGroup].keys as key}
        <button 
          class="key-btn"
          class:modifier={key.group === 'modifier' || key.group === 'session'}
          title={key.description}
          onclick={() => sendDefinedKey(key.key)}
        >
          {key.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .keybar {
    background: var(--bg-surface);
    border-top: 1px solid var(--border-default);
    flex-shrink: 0;
    user-select: none;
    -webkit-user-select: none;
  }

  .sticky-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-2);
    border-top: 1px solid var(--border-muted);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .sticky-row::-webkit-scrollbar { display: none; }

  .modifier-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-2);
    border-top: 1px solid var(--border-muted);
    border-bottom: 1px solid var(--border-muted);
  }

  .mod-btn {
    min-width: 58px;
    height: 32px;
    padding: 0 var(--space-2);
    border: 1px solid var(--accent-cyan);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--accent-cyan);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    font-weight: 600;
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .mod-btn.active {
    color: #0d1117;
    background: var(--accent-cyan);
  }

  .mod-btn:hover {
    background: rgba(56, 139, 253, 0.2);
  }
  
  .keybar-header {
    display: flex;
    align-items: center;
    padding: 0 var(--space-2);
    height: 36px;
    cursor: pointer;
  }
  
  .keybar-groups {
    display: flex;
    gap: 2px;
    flex: 1;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .keybar-groups::-webkit-scrollbar { display: none; }
  
  .group-tab {
    padding: var(--space-1) var(--space-3);
    background: none;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    cursor: pointer;
    white-space: nowrap;
    transition: all var(--transition-fast);
  }
  .group-tab.active {
    color: var(--accent-blue);
    border-color: var(--accent-blue);
    background: rgba(88, 166, 255, 0.1);
  }
  .group-tab:hover:not(.active) {
    color: var(--text-secondary);
    background: var(--bg-elevated);
  }
  
  .expand-toggle {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: var(--font-size-xs);
    padding: var(--space-1);
    flex-shrink: 0;
  }
  
  .keybar-keys {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    padding: var(--space-2);
    border-top: 1px solid var(--border-muted);
    max-height: 120px;
    overflow-y: auto;
  }

  .ctrl-letter-pad {
    display: grid;
    grid-template-columns: repeat(9, minmax(0, 1fr));
    gap: var(--space-1);
    padding: var(--space-2);
    border-top: 1px solid var(--border-muted);
  }
  
  .key-btn {
    min-width: 44px;
    height: 36px;
    padding: 0 var(--space-2);
    background: var(--bg-elevated);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    cursor: pointer;
    transition: background var(--transition-fast), border-color var(--transition-fast);
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .key-btn:hover, .key-btn:active {
    background: var(--bg-overlay);
    border-color: var(--accent-blue);
  }
  .key-btn.modifier {
    border-color: var(--accent-cyan);
    color: var(--accent-cyan);
  }

  .quick-combo {
    min-width: 50px;
    border-color: rgba(88, 166, 255, 0.45);
    color: var(--accent-blue);
  }

  .letter-btn {
    min-width: 0;
    height: 32px;
    text-transform: lowercase;
  }
  
  /* On desktop, show the keybar more compactly */
  @media (min-width: 1024px) {
    .keybar {
      display: flex;
      flex-direction: row;
      align-items: center;
      height: 40px;
    }
    .keybar.expanded {
      flex-direction: column;
      height: auto;
    }
    .keybar-header {
      flex: none;
    }
  }
  
  /* On mobile, ensure minimum tap target sizes */
  @media (max-width: 640px) {
    .key-btn {
      min-width: 48px;
      height: 40px;
    }

    .ctrl-letter-pad {
      grid-template-columns: repeat(7, minmax(0, 1fr));
    }
  }
</style>
