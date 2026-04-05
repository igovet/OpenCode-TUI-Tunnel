<script lang="ts">
  import { get } from 'svelte/store';
  import { activeTerminalRef } from '../lib/activeTerminal';

  let bottomOffset = $state(0);
  let isMobile = $state(false);
  let ctrlActive = $state(false);
  let hiddenInput: HTMLInputElement | undefined = $state();

  function handleHiddenKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' || e.key === 'Enter') {
      ctrlActive = false;
      hiddenInput?.blur();
    }
  }

  function handleHiddenBlur() {
    ctrlActive = false;
  }

  $effect(() => {
    if (ctrlActive && hiddenInput) {
      hiddenInput.value = '';
      hiddenInput.focus();

      const inputHandler = (e: Event) => {
        const target = e.target as HTMLInputElement;
        if (!target.value) return;
        
        const char = target.value[0];
        target.value = '';
        
        let seq = '';
        const charMap: Record<string, string> = {
          'c': '\x03', 'C': '\x03',
          'z': '\x1a', 'Z': '\x1a',
          'd': '\x04', 'D': '\x04',
          'l': '\x0c', 'L': '\x0c',
          'a': '\x01', 'A': '\x01',
          'e': '\x05', 'E': '\x05',
          'p': '\x10', 'P': '\x10',
          'u': '\x15', 'U': '\x15',
        };
        
        if (charMap[char]) {
          seq = charMap[char];
        } else if (/^[a-zA-Z]$/.test(char)) {
          seq = String.fromCharCode(char.toUpperCase().charCodeAt(0) - 64);
        } else {
          seq = '\x1b' + char;
        }
        
        sendKey(seq);
        ctrlActive = false;
        hiddenInput?.blur();
      };

      hiddenInput.addEventListener('input', inputHandler);

      return () => {
        hiddenInput?.removeEventListener('input', inputHandler);
      };
    }
  });

  $effect(() => {
    if (typeof window === 'undefined') return;
    
    isMobile = window.innerWidth <= 900;
    const resizeHandler = () => {
      isMobile = window.innerWidth <= 900;
    };
    window.addEventListener('resize', resizeHandler);

    if (!window.visualViewport) return () => window.removeEventListener('resize', resizeHandler);
    
    const vvHandler = () => {
      if (window.visualViewport) {
        const keyboardHeight = window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
        bottomOffset = Math.max(0, keyboardHeight);
      }
    };
    window.visualViewport.addEventListener('resize', vvHandler);
    window.visualViewport.addEventListener('scroll', vvHandler);
    vvHandler();

    return () => {
      window.removeEventListener('resize', resizeHandler);
      window.visualViewport?.removeEventListener('resize', vvHandler);
      window.visualViewport?.removeEventListener('scroll', vvHandler);
    };
  });

  function sendKey(seq: string) {
    navigator.vibrate?.(8);
    const term = get(activeTerminalRef);
    if (term) {
      // @ts-ignore - as requested by instructions
      term.terminal.input(seq, true);
    }
  }

  async function handlePaste() {
    navigator.vibrate?.(8);
    try {
      const text = await navigator.clipboard.readText();
      const term = get(activeTerminalRef);
      if (term && text) {
        for (let i = 0; i < text.length; i++) {
          // @ts-ignore
          term.terminal.input(text[i], true);
        }
      }
    } catch (err) {
      console.error('Failed to read clipboard', err);
    }
  }

  function makeTapHandler(action: () => void) {
    let startX = 0, startY = 0, moved = false;
    return {
      touchstart: (e: TouchEvent) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        moved = false;
      },
      touchmove: (e: TouchEvent) => {
        const dx = Math.abs(e.touches[0].clientX - startX);
        const dy = Math.abs(e.touches[0].clientY - startY);
        if (dx > 8 || dy > 8) moved = true;
      },
      touchend: (e: TouchEvent) => {
        if (!moved) {
          e.preventDefault();
          action();
        }
      }
    };
  }

  const keys = [
    { seq: '\x1b[A', label: '↑' },
    { seq: '\x1b[B', label: '↓' },
    { seq: '\x1b[D', label: '←' },
    { seq: '\x1b[C', label: '→' },
    { seq: '\r', label: '⏎ Enter', cls: 'enter' },
    { seq: '\x0a', label: '↵ NL', cls: 'enter' },
    { seq: '\t', label: 'Tab' },
    { seq: '\x1b', label: 'Esc' },
    { seq: '\x7f', label: '⌫' },
    { seq: '\x03', label: 'Ctrl+C', cls: 'danger' },
    { seq: '\x1a', label: 'Ctrl+Z', cls: 'danger' },
    { seq: '\x04', label: 'Ctrl+D' },
    { seq: '\x0c', label: 'Ctrl+L' },
    { seq: '\x01', label: 'Ctrl+A' },
    { seq: '\x05', label: 'Ctrl+E' },
    { seq: '\x10', label: 'Ctrl+P' }
  ].map(k => ({ ...k, tap: makeTapHandler(() => sendKey(k.seq)) }));

  const pasteTap = makeTapHandler(handlePaste);
  const ctrlTap = makeTapHandler(() => { 
    ctrlActive = !ctrlActive;
    if (ctrlActive && hiddenInput) {
      hiddenInput.value = '';
      hiddenInput.focus();
    }
  });
</script>

{#if isMobile}
  <input
    type="text"
    bind:this={hiddenInput}
    onkeydown={handleHiddenKeydown}
    onblur={handleHiddenBlur}
    style="opacity: 0; position: absolute; left: -9999px; height: 1px; width: 1px;"
    autocomplete="off"
    autocorrect="off"
    autocapitalize="off"
    spellcheck="false"
  />
  <div class="keybar" style="bottom: {bottomOffset}px">
    <button
      class="key {ctrlActive ? 'ctrl-active' : ''}"
      ontouchstart={ctrlTap.touchstart}
      ontouchmove={ctrlTap.touchmove}
      ontouchend={ctrlTap.touchend}
    >Ctrl</button>
    {#each keys as key}
      <button
        class="key {key.cls ?? ''}"
        ontouchstart={key.tap.touchstart}
        ontouchmove={key.tap.touchmove}
        ontouchend={key.tap.touchend}
      >{key.label}</button>
    {/each}
    <button
      class="key"
      ontouchstart={pasteTap.touchstart}
      ontouchmove={pasteTap.touchmove}
      ontouchend={pasteTap.touchend}
    >Paste</button>
  </div>
{/if}

<style>
  .keybar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    height: 44px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 6px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    background: #1a1a1a;
    border-top: 1px solid #333;
  }
  .keybar::-webkit-scrollbar { display: none; }

  .key {
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 4px;
    color: #ccc;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    padding: 4px 8px;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
  }
  .key.enter {
    background: #1a3a1a;
    border-color: #3a7a3a;
    color: #7fc77f;
    min-width: 60px;
  }
  .key.danger {
    background: #3a1a1a;
    border-color: #7a3a3a;
    color: #c77f7f;
  }
  .key.ctrl-active {
    background: #4a2200;
    border-color: #aa6600;
    color: #ffaa44;
  }
</style>