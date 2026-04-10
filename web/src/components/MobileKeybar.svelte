<script lang="ts">
  import { get } from 'svelte/store';
  import { activeTerminalRef } from '../lib/activeTerminal';

  let bottomOffset = $state(0);
  let isMobile = $state(false);
  let ctrlActive = $state(false);
  let keyboardOpen = $state(false);
  let cancelCtrl = () => {};

  function openCtrlInput() {
    if (ctrlActive) return;
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
      cancelCtrl = () => {};
    }
    
    cancelCtrl = cleanup;
    
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

  let scrollRef = $state<HTMLElement | null>(null);
  let scrolledLeft = $state(false);
  let scrolledRight = $state(true);

  function handleScroll() {
    if (!scrollRef) return;
    scrolledLeft = scrollRef.scrollLeft > 0;
    scrolledRight = Math.ceil(scrollRef.scrollLeft + scrollRef.clientWidth) < scrollRef.scrollWidth;
  }

  $effect(() => {
    if (typeof window === 'undefined') return;
    
    if (scrollRef) {
      handleScroll();
      const observer = new ResizeObserver(handleScroll);
      observer.observe(scrollRef);
      
      const resizeHandler = () => {
        isMobile = window.innerWidth <= 900;
        handleScroll();
      };
      window.addEventListener('resize', resizeHandler);

      let vvCleanup = () => {};
      if (window.visualViewport) {
        const vvHandler = () => {
          if (window.visualViewport) {
            const keyboardHeight = window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
            bottomOffset = Math.max(0, keyboardHeight);
            keyboardOpen = (window.innerHeight - window.visualViewport.height) > 100;
          }
        };
        window.visualViewport.addEventListener('resize', vvHandler);
        window.visualViewport.addEventListener('scroll', vvHandler);
        vvHandler();
        vvCleanup = () => {
          window.visualViewport?.removeEventListener('resize', vvHandler);
          window.visualViewport?.removeEventListener('scroll', vvHandler);
        };
      }

      return () => {
        observer.disconnect();
        window.removeEventListener('resize', resizeHandler);
        vvCleanup();
      };
    } else {
      isMobile = window.innerWidth <= 900;
      const resizeHandler = () => {
        isMobile = window.innerWidth <= 900;
      };
      window.addEventListener('resize', resizeHandler);

      let vvCleanup = () => {};
      if (window.visualViewport) {
        const vvHandler = () => {
          if (window.visualViewport) {
            const keyboardHeight = window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
            bottomOffset = Math.max(0, keyboardHeight);
            keyboardOpen = (window.innerHeight - window.visualViewport.height) > 100;
          }
        };
        window.visualViewport.addEventListener('resize', vvHandler);
        window.visualViewport.addEventListener('scroll', vvHandler);
        vvHandler();
        vvCleanup = () => {
          window.visualViewport?.removeEventListener('resize', vvHandler);
          window.visualViewport?.removeEventListener('scroll', vvHandler);
        };
      }

      return () => {
        window.removeEventListener('resize', resizeHandler);
        vvCleanup();
      };
    }
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
    { seq: '\x1b[A', label: '↑', cls: 'arrow' },
    { seq: '\x1b[B', label: '↓', cls: 'arrow' },
    { seq: '\x1b[D', label: '↑', innerCls: 'rotate-left', cls: 'arrow' },
    { seq: '\x1b[C', label: '↑', innerCls: 'rotate-right', cls: 'arrow' },
    { seq: '', action: () => { const term = get(activeTerminalRef); if (term) term.terminal.scrollToTop(); }, label: 'Home' },
    { seq: '', action: () => { const term = get(activeTerminalRef); if (term) term.terminal.scrollToBottom(); }, label: 'End' },
    { seq: '\r', label: '⏎ Enter', cls: 'enter' },
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
            cancelCtrl();
          } else {
            openCtrlInput();
          }
        }
      }
    };
  })();

  const keyboardTap = makeTapHandler(() => {
    const term = get(activeTerminalRef);
    if (term) {
      term.toggleMobileKeyboard();
    }
  });

  const nlTap = makeTapHandler(() => sendKey('\x0a'));
</script>

{#if isMobile}
  <div 
    class="keybar" 
    style="bottom: {bottomOffset}px"
    onpointerdown={(e) => e.preventDefault()}
  >
    <div class="fixed-section">
      <button
        class="key key-keyboard {keyboardOpen ? 'kb-active' : ''}"
        tabindex="-1"
        onmousedown={(e) => e.preventDefault()}
        ontouchstart={keyboardTap.touchstart}
        ontouchmove={keyboardTap.touchmove}
        ontouchend={keyboardTap.touchend}
      >⌨</button>
      <button
        class="key nl-btn"
        tabindex="-1"
        onmousedown={(e) => e.preventDefault()}
        ontouchstart={nlTap.touchstart}
        ontouchmove={nlTap.touchmove}
        ontouchend={nlTap.touchend}
      >↵</button>
    </div>
    <div class="divider"></div>
    <div class="scroll-wrapper" class:scrolled-left={scrolledLeft} class:scrolled-right={scrolledRight}>
      <div class="scroll-section" bind:this={scrollRef} onscroll={handleScroll}>
        <button
        class="key {ctrlActive ? 'ctrl-active' : ''}"
        tabindex="-1"
        onmousedown={(e) => e.preventDefault()}
        ontouchstart={ctrlTap.touchstart}
        ontouchmove={ctrlTap.touchmove}
        ontouchend={ctrlTap.touchend}
      >Ctrl</button>
      {#each keys as key}
        <button
          class="key {key.cls ?? ''}"
          tabindex="-1"
          onmousedown={(e) => e.preventDefault()}
          ontouchstart={key.tap.touchstart}
          ontouchmove={key.tap.touchmove}
          ontouchend={key.tap.touchend}
        >
          {#if key.innerCls}
            <span class={key.innerCls}>{key.label}</span>
          {:else}
            {key.label}
          {/if}
        </button>
      {/each}
      <button
        class="key"
        tabindex="-1"
        onmousedown={(e) => e.preventDefault()}
        ontouchstart={pasteTap.touchstart}
        ontouchmove={pasteTap.touchmove}
        ontouchend={pasteTap.touchend}
      >Paste</button>
      </div>
    </div>
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
    gap: 8px;
    padding: 0 6px;
    background: #1a1a1a;
    border-top: 1px solid #333;
  }
  
  .fixed-section {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .divider {
    width: 1px;
    height: 32px;
    background: #444;
    margin: 0 4px;
    flex-shrink: 0;
  }

  .scroll-wrapper {
    position: relative;
    flex: 1;
    display: flex;
    min-width: 0;
  }

  .scroll-wrapper::before,
  .scroll-wrapper::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 20px;
    pointer-events: none;
    z-index: 1;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .scroll-wrapper::before {
    left: 0;
    background: linear-gradient(to right, #1a1a1a, transparent);
  }

  .scroll-wrapper::after {
    right: 0;
    background: linear-gradient(to left, #1a1a1a, transparent);
  }

  .scroll-wrapper.scrolled-left::before {
    opacity: 1;
  }

  .scroll-wrapper.scrolled-right::after {
    opacity: 1;
  }

  .scroll-section {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }
  .scroll-section::-webkit-scrollbar { display: none; }

  .key {
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 0;
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
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .key.arrow {
    width: 32px;
    min-width: 32px;
    padding: 0;
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
  .key.key-keyboard {
    background: #0d2a3a;
    border-color: #1a6080;
    color: #4db8e8;
    padding: 4px 14px;
    font-size: 20px;
    border-width: 1px;
    min-width: 48px;
    text-align: center;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .key.nl-btn {
    background: #1a3a1a;
    border-color: #3a7a3a;
    color: #7fc77f;
    padding: 4px 14px;
    font-size: 20px;
    border-width: 1px;
    min-width: 48px;
    text-align: center;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .key.kb-active {
    background: #003a4a;
    border-color: #0099bb;
    color: #44ddff;
    padding: 4px 14px;
    font-size: 20px;
    min-width: 48px;
    text-align: center;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .rotate-left {
    display: inline-block;
    transform: rotate(-90deg);
  }
  .rotate-right {
    display: inline-block;
    transform: rotate(90deg);
  }
</style>
