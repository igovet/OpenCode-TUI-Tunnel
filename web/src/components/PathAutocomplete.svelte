<script lang="ts">
  import { suggestPaths } from '../lib/api';

  let { value = '', onchange, onselect, sshConnectionId } = $props<{
    value: string;
    onchange: (val: string) => void;
    onselect?: (val: string) => void;
    sshConnectionId?: string;
  }>();

  let suggestions = $state<string[]>([]);
  let activeIndex = $state(-1);
  let showSuggestions = $state(false);
  let debounceTimer: number;
  let isLoading = $state(false);
  let inputValue = $state('');
  let containerEl: HTMLElement | null = null;

  // Sync from parent when value prop changes externally
  $effect(() => {
    inputValue = value;
  });

  // Watch inputValue for changes and trigger debounced search + onchange
  $effect(() => {
    const val = inputValue;

    // Notify parent of value change
    onchange(val);

    clearTimeout(debounceTimer);
    if (!val) {
      suggestions = [];
      showSuggestions = false;
      isLoading = false;
      return;
    }

    isLoading = true;
    debounceTimer = window.setTimeout(async () => {
      try {
        suggestions = await suggestPaths(val, sshConnectionId);
        showSuggestions = suggestions.length > 0;
        activeIndex = -1;
      } catch {
        suggestions = [];
        showSuggestions = false;
      } finally {
        isLoading = false;
      }
    }, 150);
  });

  // Clear and reload when sshConnectionId changes
  $effect(() => {
    const trackedId = sshConnectionId;
    suggestions = [];
    showSuggestions = false;
    activeIndex = -1;
    isLoading = false;
    clearTimeout(debounceTimer);
    if (inputValue) {
      isLoading = true;
      debounceTimer = window.setTimeout(async () => {
        try {
          suggestions = await suggestPaths(inputValue, trackedId);
          showSuggestions = suggestions.length > 0;
        } catch {
          suggestions = [];
          showSuggestions = false;
        } finally {
          isLoading = false;
        }
      }, 150);
    }
  });

  function handleInput(e: Event) {
    inputValue = (e.target as HTMLInputElement).value;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!showSuggestions) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, suggestions.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        selectSuggestion(suggestions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      showSuggestions = false;
    }
  }

  function selectSuggestion(suggestion: string) {
    inputValue = suggestion;
    // onchange is called by the $effect watching inputValue
    onselect?.(suggestion);
    activeIndex = -1;
    showSuggestions = false;
  }

  // Close the suggestions dropdown when clicking outside the component.
  function handleWindowClick(e: MouseEvent) {
    if (!containerEl) return;
    if (!containerEl.contains(e.target as Node)) {
      showSuggestions = false;
    }
  }
</script>

<svelte:window onclick={handleWindowClick} />

<div class="autocomplete" bind:this={containerEl}>
  <div class="input-container">
    <span class="input-icon" aria-hidden="true">
      <!-- Folder icon (Lucide-style) -->
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    </span>
    <input
      type="text"
      class="input-field"
      value={inputValue}
      oninput={handleInput}
      onkeydown={handleKeyDown}
      placeholder="Enter absolute path (e.g., /home/user/project)"
      autocomplete="off"
      aria-label="Working directory path"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={showSuggestions}
      aria-controls="path-suggestions"
      aria-activedescendant={activeIndex >= 0 ? `path-suggestion-${activeIndex}` : undefined}
    />
    {#if isLoading}
      <span class="loading-spinner" aria-hidden="true"></span>
    {/if}
  </div>

  {#if showSuggestions}
    <ul class="suggestions" role="listbox" aria-label="Path suggestions" id="path-suggestions">
      {#each suggestions as suggestion, i}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <li
          role="option"
          id="path-suggestion-{i}"
          aria-selected={i === activeIndex}
          class:active={i === activeIndex}
          onmousedown={() => selectSuggestion(suggestion)}
        >
          <span class="suggestion-icon" aria-hidden="true">
            <!-- Folder icon (Lucide-style) -->
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <span>{suggestion}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .autocomplete {
    position: relative;
    width: 100%;
  }

  .input-container {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 36px;
    padding: 0 var(--space-3);
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .input-container:focus-within {
    border-color: var(--border-default);
  }

  .input-icon {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .input-field {
    flex: 1;
    height: 100%;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    line-height: var(--line-height-normal);
    min-width: 0;
  }

  .input-field::placeholder {
    color: var(--text-muted);
  }

  .suggestions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin: var(--space-1) 0 0;
    padding: var(--space-1) 0;
    list-style: none;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    backdrop-filter: blur(12px);
    z-index: var(--z-dropdown);
    max-height: 200px;
    overflow-y: auto;
  }

  li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    transition: background var(--transition-fast);
  }

  li.active {
    background: var(--bg-overlay);
  }

  @media (min-width: 769px) {
    li:hover {
      background: var(--bg-overlay);
    }
  }

  li:active {
    background: var(--bg-elevated);
  }

  .suggestion-icon {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .loading-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--border-subtle);
    border-top-color: var(--accent-blue);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 640px) {
    .input-container {
      height: 40px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    li {
      transition: none;
    }

    .loading-spinner {
      animation: none;
      opacity: 0.5;
    }
  }
</style>
