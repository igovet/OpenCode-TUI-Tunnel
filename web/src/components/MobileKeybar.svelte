<script lang="ts">
  import { get } from 'svelte/store';
  import { activeTerminalRef } from '../lib/activeTerminal';

  let bottomOffset = $state(0);
  let isMobile = $state(false);
  let ctrlActive = $state(false);

  function openCtrlInput() {
    ctrlActive = true;
    
    // Create a temporary contenteditable div
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.style.cssText = 'position:fixed;opacity:0;left:-9999px;top:0;width:1px;height:1px;';
    div.autocapitalize = 'off';
    div.setAttribute('autocorrect', 'off');
    div.setAttribute('autocomplete', 'off');
    div.setAttribute('spellcheck', 'false');
    document.body.appendChild(div);
    
    function cleanup() {
      ctrlActive = false;
      div.removeEventListener('input', onInput);
      div.removeEventListener('blur', onBlur);
      div.removeEventListener('keydown', onKeydown);
      if (div.parentNode) document.body.removeChild(div);
    }
    
    function onInput() {
      const char = (div.textContent || '')[0];
      if (!char) return;
      div.textContent = '';
      
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
      
      const seq =
        charMap[char] ??
        (/^[a-zA-Z]$/.test(char)
          ? String.fromCharCode(char.toUpperCase().charCodeAt(0) - 64)
          : '\x1b' + char);
      
      sendKey(seq);
      cleanup();
    }
    
    function onBlur() {
      cleanup();
    }
    
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        cleanup();
      }
    }
    
    div.addEventListener('input', onInput);
    div.addEventListener('blur', onBlur);
    div.addEventListener('keydown', onKeydown);
    
    // Focus must happen in same tick as user gesture (touchend)
    div.focus();
  }

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
          term.terminal.input(text[i], true);
        }
      }
    } catch (err) {
      console.error('Failed to read clipboard', err);
    }
  }

  function isKeyboardOpen(): boolean {
    if (typeof window === 'undefined' || !window.visualViewport) return false;
    return (window.innerHeight - window.visualViewport.height) > 100;
  }

  function makeTapHandler(action: () => void) {
    let startX = 0, startY = 0, moved = false;
    let wasKeyboardOpen = false;
    return {
      touchstart: (e: TouchEvent) => {
        e.stopPropagation();
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        moved = false;
        wasKeyboardOpen = isKeyboardOpen();
      },
      touchmove: (e: TouchEvent) => {
        const dx = Math.abs(e.touches[0].clientX - startX);
        const dy = Math.abs(e.touches[0].clientY - startY);
        if (dx > 8 || dy > 8) moved = true;
      },
      touchend: (e: TouchEvent) => {
        e.stopPropagation();
        if (!moved) {
          e.preventDefault();
          action();
          // After action: if keyboard was closed before, make sure it stays closed
          if (!wasKeyboardOpen) {
            // Use setTimeout to run after any focus side effects
            setTimeout(() => {
              if (isKeyboardOpen()) {
                // Keyboard opened unexpectedly - close it by blurring active element
                if (document.activeElement && document.activeElement !== document.body) {
                  (document.activeElement as HTMLElement).blur();
                }
              }
            }, 50);
          }
        }
      }
    };
  }

  const keys = [
    { seq: '\x1b[A', label: '↑' },
    { seq: '\x1b[B', label: '↓' },
    { seq: '\x1b[D', label: '←' },
    { seq: '\x1b[C', label: '→' },
    { seq: '', action: () => { const term = get(activeTerminalRef); if (term) term.terminal.scrollToTop(); }, label: 'Home' },
    { seq: '', action: () => { const term = get(activeTerminalRef); if (term) term.terminal.scrollToBottom(); }, label: 'End' },
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
  ].map(k => ({ ...k, tap: makeTapHandler(k.action || (() => sendKey(k.seq))) }));

  const pasteTap = makeTapHandler(handlePaste);
  const ctrlTap = (() => {
    let startX = 0, startY = 0, moved = false;
    return {
      touchstart: (e: TouchEvent) => {
        e.stopPropagation();
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
        e.stopPropagation();
        if (!moved) {
          e.preventDefault();
          if (ctrlActive) {
            ctrlActive = false;
          } else {
            openCtrlInput();
          }
        }
      }
    };
  })();
</script>

{#if isMobile}
  <div 
    class="keybar" 
    style="bottom: {bottomOffset}px"
    onpointerdown={(e) => e.preventDefault()}
  >
    <button
      class="key {ctrlActive ? 'ctrl-active' : ''}"
      tabindex="-1"
      ontouchstart={ctrlTap.touchstart}
      ontouchmove={ctrlTap.touchmove}
      ontouchend={ctrlTap.touchend}
    >Ctrl</button>
    {#each keys as key}
      <button
        class="key {key.cls ?? ''}"
        tabindex="-1"
        ontouchstart={key.tap.touchstart}
        ontouchmove={key.tap.touchmove}
        ontouchend={key.tap.touchend}
      >{key.label}</button>
    {/each}
    <button
      class="key"
      tabindex="-1"
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
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
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
