<script lang="ts">
  import { suggestPaths } from '../lib/api';

  let { value = '', onchange, onselect } = $props<{
    value: string;
    onchange: (val: string) => void;
    onselect?: (val: string) => void;
  }>();

  let suggestions = $state<string[]>([]);
  let activeIndex = $state(-1);
  let showSuggestions = $state(false);
  let debounceTimer: number;

  function handleInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    onchange(val);
    
    clearTimeout(debounceTimer);
    if (!val) {
      suggestions = [];
      showSuggestions = false;
      return;
    }

    debounceTimer = window.setTimeout(async () => {
      try {
        suggestions = await suggestPaths(val);
        showSuggestions = suggestions.length > 0;
        activeIndex = -1;
      } catch {
        suggestions = [];
        showSuggestions = false;
      }
    }, 150);
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
    onchange(suggestion);
    onselect?.(suggestion);
    activeIndex = -1;
    showSuggestions = false;
  }
</script>

<div class="autocomplete">
  <input 
    type="text" 
    {value}
    oninput={handleInput}
    onkeydown={handleKeyDown}
    placeholder="Enter absolute path (e.g., /home/user/project)"
    autocomplete="off"
  />
  
  {#if showSuggestions}
    <ul class="suggestions">
      {#each suggestions as suggestion, i}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <li 
          class:active={i === activeIndex}
          onmousedown={() => selectSuggestion(suggestion)}
        >
          {suggestion}
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
  
  input {
    width: 100%;
    padding: 8px 12px;
    background: var(--bg-surface, #161b22);
    border: 1px solid var(--border-default, #30363d);
    color: var(--text-primary, #e6edf3);
    border-radius: 0;
    font-family: inherit;
    box-sizing: border-box;
  }

  input:focus {
    outline: none;
    border-color: var(--accent-blue, #58a6ff);
  }

  .suggestions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
    background: var(--bg-surface, #161b22);
    border: 1px solid var(--border-default, #30363d);
    border-radius: 0;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    z-index: 1000;
    max-height: 200px;
    overflow-y: auto;
  }

  li {
    padding: 8px 12px;
    cursor: pointer;
    color: var(--text-primary, #e6edf3);
  }

  li:hover, li.active {
    background: var(--bg-tertiary, #21262d);
  }
</style>
