<script lang="ts">
  import { untrack } from 'svelte';
  import { get } from 'svelte/store';
  import { activeTerminalRef } from '../lib/activeTerminal';
  import type { TerminalManager } from '../lib/terminal';

  type CtrlMode = 'idle' | 'ctrlSubmenuOpen' | 'awaitingCtrl';

  let bottomOffset = $state(0);
  let isMobile = $state(false);
  let keyboardOpen = $state(false);
  let ctrlMode = $state<CtrlMode>('idle');
  let arrowPadOpen = $state(false);

  let scrollRef = $state<HTMLElement | null>(null);
  let scrolledLeft = $state(false);
  let scrolledRight = $state(true);

  let arrowTriggerRef = $state<HTMLButtonElement | null>(null);
  let arrowOverlayLeft = $state(8);
  let ctrlCaptureTimeout: ReturnType<typeof setTimeout> | null = null;
  const CTRL_AWAITING_IDLE_TIMEOUT_MS = 5_000;
  let activeTerminal = $derived($activeTerminalRef);

  function handleScroll() {
    if (!scrollRef) return;
    scrolledLeft = scrollRef.scrollLeft > 0;
    scrolledRight = Math.ceil(scrollRef.scrollLeft + scrollRef.clientWidth) < scrollRef.scrollWidth;
  }

  function triggerHaptic(durationMs = 8) {
    navigator.vibrate?.(durationMs);
  }

  function getActiveTerminal(): TerminalManager | null {
    return get(activeTerminalRef);
  }

  function sendKey(seq: string) {
    const terminal = getActiveTerminal();
    terminal?.onData(seq);
  }

  function closeArrowOverlay() {
    arrowPadOpen = false;
  }

  function clearCtrlCaptureTimeout() {
    if (ctrlCaptureTimeout) {
      clearTimeout(ctrlCaptureTimeout);
      ctrlCaptureTimeout = null;
    }
  }

  function isMobileKeyboardLikelyOpen() {
    if (typeof window === 'undefined') return keyboardOpen;
    if (!window.visualViewport) return keyboardOpen;
    return keyboardOpen || window.innerHeight - window.visualViewport.height > 100;
  }

  function ensureMobileKeyboardOpen() {
    const term = getActiveTerminal();
    if (!term) return;
    if (isMobileKeyboardLikelyOpen()) return;
    term.toggleMobileKeyboard();
  }

  function clearAwaitingCtrlState() {
    clearCtrlCaptureTimeout();
    getActiveTerminal()?.clearInputTransform();
  }

  function setCtrlMode(nextMode: CtrlMode) {
    if (nextMode === ctrlMode) return;

    if (ctrlMode === 'awaitingCtrl') {
      clearAwaitingCtrlState();
    }

    ctrlMode = nextMode;
    if (ctrlMode !== 'idle') {
      closeArrowOverlay();
    }
  }

  function beginCtrlCapture() {
    const term = getActiveTerminal();
    if (!term) {
      setCtrlMode('idle');
      return;
    }

    term.clearInputTransform();
    clearCtrlCaptureTimeout();
    ctrlCaptureTimeout = setTimeout(() => {
      if (ctrlMode !== 'awaitingCtrl') return;
      term.clearInputTransform();
      setCtrlMode('idle');
    }, CTRL_AWAITING_IDLE_TIMEOUT_MS);

    term.setInputTransform((data: string) => {
      const captured = normalizeCapturedChar(data);
      clearCtrlCaptureTimeout();

      if (!captured) {
        setCtrlMode('idle');
        return '';
      }

      const ctrlByte = computeCtrlByteFromChar(captured);
      if (ctrlByte) {
        triggerHaptic();
      }
      setCtrlMode('idle');
      return ctrlByte ?? '';
    }, CTRL_AWAITING_IDLE_TIMEOUT_MS);

    ensureMobileKeyboardOpen();
    queueMicrotask(() => {
      term.terminal.focus();
    });
    keyboardOpen = true;
  }

  function resetExpansionAndCaptureState() {
    setCtrlMode('idle');
    closeArrowOverlay();
  }

  function updateArrowOverlayPosition() {
    if (typeof window === 'undefined' || !arrowPadOpen || !arrowTriggerRef) return;

    const triggerRect = arrowTriggerRef.getBoundingClientRect();
    const overlayWidth = 164;
    const viewportWidth = window.innerWidth;
    const rawLeft = triggerRect.left + triggerRect.width / 2 - overlayWidth / 2;
    arrowOverlayLeft = Math.max(8, Math.min(rawLeft, viewportWidth - overlayWidth - 8));
  }

  function computeCtrlByteFromChar(input: string): string | null {
    if (input.length !== 1) return null;

    const lower = input.toLowerCase();
    if (/^[a-z]$/.test(lower)) {
      return String.fromCharCode(lower.charCodeAt(0) - 96);
    }

    if (lower === '[') return '\x1b';
    if (lower === '\\') return '\x1c';
    if (lower === ']') return '\x1d';

    return null;
  }

  function normalizeCapturedChar(input: string | null | undefined): string | null {
    if (!input) return null;
    return input.slice(-1);
  }

  function handleKeyboardToggle() {
    triggerHaptic();
    resetExpansionAndCaptureState();
    const term = getActiveTerminal();
    if (term) {
      term.toggleMobileKeyboard();
    }
  }

  function handleSimpleInput(sequence: string) {
    triggerHaptic();
    resetExpansionAndCaptureState();
    sendKey(sequence);
  }

  async function handlePaste() {
    triggerHaptic();
    resetExpansionAndCaptureState();
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        sendKey(text);
      }
    } catch (err) {
      console.error('Failed to read clipboard', err);
    }
  }

  function handleCtrlTriggerToggle() {
    triggerHaptic();
    if (ctrlMode === 'ctrlSubmenuOpen') {
      setCtrlMode('idle');
      return;
    }
    setCtrlMode('ctrlSubmenuOpen');
  }

  function handleArrowTriggerToggle() {
    triggerHaptic();
    setCtrlMode('idle');
    arrowPadOpen = !arrowPadOpen;
    if (arrowPadOpen) {
      queueMicrotask(updateArrowOverlayPosition);
    }
  }

  function handleHomeKey() {
    handleArrowInput('\x1b[H', { hapticDurationMs: 30, resetExpansionState: true });
  }

  function handleEndKey() {
    handleArrowInput('\x1b[F', { hapticDurationMs: 30, resetExpansionState: true });
  }

  function handleCtrlBack() {
    triggerHaptic();
    setCtrlMode('idle');
  }

  function handleCtrlAwaiting() {
    triggerHaptic();
    setCtrlMode('awaitingCtrl');
    beginCtrlCapture();
  }

  function handleCtrlP() {
    triggerHaptic();
    sendKey('\x10');
    setCtrlMode('idle');
  }

  function handleCtrlX() {
    triggerHaptic(30);
    get(activeTerminalRef)?.write('\x18');
    ensureMobileKeyboardOpen();
    setCtrlMode('idle');
  }

  function handleCtrlC() {
    triggerHaptic();
    sendKey('\x03');
    setCtrlMode('idle');
  }

  function handleArrowInput(
    sequence: string,
    options?: { hapticDurationMs?: number; resetExpansionState?: boolean },
  ) {
    triggerHaptic(options?.hapticDurationMs);
    if (options?.resetExpansionState) {
      resetExpansionAndCaptureState();
    }
    sendKey(sequence);
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
        updateArrowOverlayPosition();
      };
      window.addEventListener('resize', resizeHandler);

      let vvCleanup = () => {};
      if (window.visualViewport) {
        const vvHandler = () => {
          if (window.visualViewport) {
            const keyboardHeight =
              window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
            bottomOffset = Math.max(0, keyboardHeight);
            const nextKeyboardOpen = window.innerHeight - window.visualViewport.height > 100;
            keyboardOpen = nextKeyboardOpen;
            updateArrowOverlayPosition();
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
        updateArrowOverlayPosition();
      };
      window.addEventListener('resize', resizeHandler);

      let vvCleanup = () => {};
      if (window.visualViewport) {
        const vvHandler = () => {
          if (window.visualViewport) {
            const keyboardHeight =
              window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
            bottomOffset = Math.max(0, keyboardHeight);
            const nextKeyboardOpen = window.innerHeight - window.visualViewport.height > 100;
            keyboardOpen = nextKeyboardOpen;
            updateArrowOverlayPosition();
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

  $effect(() => {
    if (typeof window === 'undefined') return;

    const tm = activeTerminal;
    if (!tm) return;

    const xdataDispose = tm.terminal.onData((data) => {
      if (data !== '\r') return;
      if (!keyboardOpen) return;
      if (ctrlMode !== 'idle') return;
      untrack(() => tm.toggleMobileKeyboard());
    });

    const unsubscribeFocusChange = tm.onTextareaFocusChange((focused: boolean) => {
      keyboardOpen = focused;
      if (!focused) {
        bottomOffset = 0;
      } else if (typeof window !== 'undefined' && window.visualViewport) {
        const viewportDelta =
          window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
        bottomOffset = Math.max(0, viewportDelta);
      }
    });

    return () => {
      unsubscribeFocusChange();
      xdataDispose.dispose();
      resetExpansionAndCaptureState();
    };
  });

  $effect(() => {
    const mode = ctrlMode;
    queueMicrotask(() => {
      if (mode !== 'idle') {
        handleScroll();
        return;
      }
      handleScroll();
    });
  });

  $effect(() => {
    if (typeof document === 'undefined') return;
    if (ctrlMode === 'idle' && !arrowPadOpen) return;

    const onDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      const withinKeybar =
        target instanceof Element &&
        (target.closest('.keybar') || target.closest('[data-arrow-overlay="true"]'));
      if (withinKeybar) return;

      resetExpansionAndCaptureState();
    };

    document.addEventListener('pointerdown', onDocumentPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onDocumentPointerDown);
    };
  });

  $effect(() => {
    if (!arrowPadOpen) return;

    queueMicrotask(() => {
      updateArrowOverlayPosition();
    });

    if (typeof window === 'undefined') return;
    const onResize = () => updateArrowOverlayPosition();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  $effect(() => {
    return () => {
      resetExpansionAndCaptureState();
    };
  });
</script>

{#if isMobile}
  <div class="keybar" style="bottom: {bottomOffset}px" onpointerdown={(e) => e.preventDefault()}>
    <div class="fixed-section">
      <button
        class="key key-keyboard {keyboardOpen ? 'kb-active' : ''}"
        tabindex="-1"
        onmousedown={(e) => e.preventDefault()}
        onclick={handleKeyboardToggle}
      >⌨</button>
      <button
        class="key nl-btn"
        tabindex="-1"
        onmousedown={(e) => e.preventDefault()}
        onclick={() => handleSimpleInput('\x0a')}
      >↵</button>
    </div>
    <div class="divider"></div>
    <div class="scroll-wrapper" class:scrolled-left={scrolledLeft} class:scrolled-right={scrolledRight}>
      <div class="scroll-section" bind:this={scrollRef} onscroll={handleScroll}>
        {#if ctrlMode !== 'idle'}
          <button
            class="key"
            tabindex="-1"
            onmousedown={(e) => e.preventDefault()}
            onclick={handleCtrlBack}
          >← Back</button>
          <button
            class="key {ctrlMode === 'awaitingCtrl' ? 'ctrl-active' : ''}"
            tabindex="-1"
            onmousedown={(e) => e.preventDefault()}
            onclick={handleCtrlAwaiting}
          >Ctrl</button>
          <button
            class="key"
            tabindex="-1"
            onmousedown={(e) => e.preventDefault()}
            onclick={handleCtrlP}
          >Ctrl+p</button>
          <button
            class="key"
            tabindex="-1"
            onmousedown={(e) => e.preventDefault()}
            onclick={handleCtrlX}
          >Ctrl+x</button>
          <button
            class="key"
            tabindex="-1"
            onmousedown={(e) => e.preventDefault()}
            onclick={handleCtrlC}
          >Ctrl+c</button>
        {:else}
          <button
            class="key"
            tabindex="-1"
            onmousedown={(e) => e.preventDefault()}
            onclick={handleCtrlTriggerToggle}
          >Ctrl+</button>
          <button
            class="key {arrowPadOpen ? 'ctrl-active' : ''}"
            tabindex="-1"
            bind:this={arrowTriggerRef}
            onmousedown={(e) => e.preventDefault()}
            onclick={handleArrowTriggerToggle}
          >⊞ arrows</button>
          <button
            class="key"
            tabindex="-1"
            onmousedown={(e) => e.preventDefault()}
            onclick={handleHomeKey}
          >Home</button>
          <button
            class="key"
            tabindex="-1"
            onmousedown={(e) => e.preventDefault()}
            onclick={handleEndKey}
          >End</button>
          <button
            class="key"
            tabindex="-1"
            onmousedown={(e) => e.preventDefault()}
            onclick={() => handleSimpleInput('\t')}
          >Tab</button>
          <button
            class="key"
            tabindex="-1"
            onmousedown={(e) => e.preventDefault()}
            onclick={() => handleSimpleInput('\x1b')}
          >Esc</button>
          <button
            class="key"
            tabindex="-1"
            onmousedown={(e) => e.preventDefault()}
            onclick={handlePaste}
          >Paste</button>
          <button
            class="key enter"
            tabindex="-1"
            onmousedown={(e) => e.preventDefault()}
            onclick={() => handleSimpleInput('\r')}
          >↵ Enter</button>
        {/if}
      </div>
      <!-- Subtle scroll affordance: a chevron appears at the right edge
           when more keys are scrollable to the right, signalling that the
           row can be swiped. Fades out once scrolled to the end. -->
      {#if scrolledRight}
        <span class="scroll-hint" aria-hidden="true">›</span>
      {/if}
    </div>

    {#if arrowPadOpen}
      <div
        data-arrow-overlay="true"
        class="arrow-overlay"
        style="left: {arrowOverlayLeft}px; bottom: {bottomOffset + 54}px;"
      >
        <div class="arrow-row">
          <button
            class="key arrow"
            tabindex="-1"
            onmousedown={(e) => e.preventDefault()}
            onclick={() => handleArrowInput('\x1b[A')}
          >↑</button>
        </div>
        <div class="arrow-row">
          <button
            class="key arrow"
            tabindex="-1"
            onmousedown={(e) => e.preventDefault()}
            onclick={() => handleArrowInput('\x1b[D')}
          ><span class="rotate-left">↑</span></button>
          <button
            class="key arrow"
            tabindex="-1"
            onmousedown={(e) => e.preventDefault()}
            onclick={() => handleArrowInput('\x1b[B')}
          ><span class="rotate-down">↑</span></button>
          <button
            class="key arrow"
            tabindex="-1"
            onmousedown={(e) => e.preventDefault()}
            onclick={() => handleArrowInput('\x1b[C')}
          ><span class="rotate-right">↑</span></button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .keybar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: var(--z-mobile-chrome, 150);
    height: var(--mobile-keybar-height);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-2);
    background: color-mix(in srgb, var(--bg-elevated) 48%, transparent);
    backdrop-filter: blur(16px) saturate(140%);
    -webkit-backdrop-filter: blur(16px) saturate(140%);
    border-top: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    box-shadow:
      var(--shadow-inset),
      0 -6px 24px rgba(0, 0, 0, 0.36);
    transition: bottom var(--transition-fast);
  }

  .fixed-section {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .divider {
    width: 1px;
    height: 28px;
    background: var(--border-muted);
    margin: 0 var(--space-1);
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
    width: 28px;
    pointer-events: none;
    z-index: 2;
    opacity: 0;
    transition: opacity var(--transition-moderate);
  }

  .scroll-wrapper::before {
    left: 0;
    background: linear-gradient(to right, var(--bg-surface), transparent);
  }

  .scroll-wrapper::after {
    right: 0;
    background: linear-gradient(to left, var(--bg-surface), transparent);
  }

  .scroll-wrapper.scrolled-left::before {
    opacity: 1;
  }

  .scroll-wrapper.scrolled-right::after {
    opacity: 1;
  }

  /* Subtle scroll affordance chevron at the right edge. Appears only while
     there is more content to the right (scrolledRight=true) and fades/hides
     once the user reaches the end. Pulsing animation draws the eye gently. */
  .scroll-hint {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 3;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    font-size: 16px;
    line-height: 1;
    color: var(--text-muted);
    pointer-events: none;
    opacity: 0.7;
    animation: keybar-scroll-hint 1.8s ease-in-out infinite;
  }

  @keyframes keybar-scroll-hint {
    0%, 100% { opacity: 0.5; transform: translateY(-50%) translateX(0); }
    50% { opacity: 0.9; transform: translateY(-50%) translateX(2px); }
  }

  .scroll-section {
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    padding: 0 var(--space-1);
  }
  .scroll-section::-webkit-scrollbar { display: none; }

  .key {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    padding: 0 var(--space-2-5, 0.625rem);
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    min-height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast),
      transform var(--transition-fast);
  }
  .key:active {
    background: var(--bg-overlay);
    border-color: var(--border-accent);
    color: var(--text-primary);
    transform: scale(0.94);
  }

  /* Special keys: Ctrl+, arrows, Tab, Esc, Home, End, Paste */
  .key:not(.enter):not(.key-keyboard):not(.nl-btn):not(.ctrl-active):not(.kb-active):not(.arrow) {
    background: var(--bg-surface);
    color: var(--text-secondary);
  }
  .key:not(.enter):not(.key-keyboard):not(.nl-btn):not(.ctrl-active):not(.kb-active):not(.arrow):active {
    background: var(--bg-overlay);
    border-color: var(--border-accent);
    color: var(--text-primary);
  }

  .key.arrow {
    width: 38px;
    min-width: 38px;
    min-height: 38px;
    padding: 0;
    background: var(--bg-surface);
    color: var(--text-secondary);
    font-size: var(--font-size-base);
  }
  .key.arrow:active {
    background: var(--bg-overlay);
    border-color: var(--border-accent);
    color: var(--text-primary);
  }

  .key.enter {
    background: color-mix(in srgb, var(--accent-green) 10%, var(--bg-surface));
    border-color: color-mix(in srgb, var(--accent-green) 32%, var(--border-subtle));
    color: var(--accent-green);
    min-width: 56px;
    min-height: 32px;
    font-weight: var(--font-weight-semibold);
  }
  .key.enter:active {
    background: color-mix(in srgb, var(--accent-green) 20%, var(--bg-overlay));
    border-color: var(--accent-green);
  }

  .key.ctrl-active {
    background: color-mix(in srgb, var(--accent-yellow) 14%, var(--bg-overlay));
    border-color: color-mix(in srgb, var(--accent-yellow) 45%, var(--border-accent));
    color: var(--accent-yellow);
  }
  .key.ctrl-active:active {
    background: color-mix(in srgb, var(--accent-yellow) 24%, var(--bg-overlay));
    border-color: var(--accent-yellow);
  }

  .key.key-keyboard {
    background: color-mix(in srgb, var(--accent-cyan) 10%, var(--bg-surface));
    border-color: color-mix(in srgb, var(--accent-cyan) 30%, var(--border-subtle));
    color: var(--accent-cyan);
    padding: 0 var(--space-2-5, 0.625rem);
    font-size: 18px;
    min-width: 42px;
    min-height: 32px;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .key.key-keyboard:active {
    background: color-mix(in srgb, var(--accent-cyan) 18%, var(--bg-overlay));
    border-color: var(--accent-cyan);
  }

  .key.nl-btn {
    background: color-mix(in srgb, var(--accent-green) 10%, var(--bg-surface));
    border-color: color-mix(in srgb, var(--accent-green) 32%, var(--border-subtle));
    color: var(--accent-green);
    padding: 0 var(--space-2-5, 0.625rem);
    font-size: 18px;
    min-width: 42px;
    min-height: 32px;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .key.nl-btn:active {
    background: color-mix(in srgb, var(--accent-green) 20%, var(--bg-overlay));
    border-color: var(--accent-green);
  }

  .key.kb-active {
    background: color-mix(in srgb, var(--accent-blue) 14%, var(--bg-overlay));
    border-color: color-mix(in srgb, var(--accent-blue) 45%, var(--border-accent));
    color: var(--accent-blue);
    padding: 0 var(--space-2-5, 0.625rem);
    font-size: 18px;
    min-width: 42px;
    min-height: 32px;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .key.kb-active:active {
    background: color-mix(in srgb, var(--accent-blue) 24%, var(--bg-overlay));
    border-color: var(--accent-blue);
  }

  .arrow-overlay {
    position: fixed;
    z-index: var(--z-tooltip, 500);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-1-5);
    background: color-mix(in srgb, var(--bg-elevated) 48%, transparent);
    backdrop-filter: blur(16px) saturate(140%);
    -webkit-backdrop-filter: blur(16px) saturate(140%);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg), var(--shadow-inset);
  }

  .arrow-row {
    display: flex;
    justify-content: center;
    gap: var(--space-1);
  }

  .rotate-left {
    display: inline-block;
    transform: rotate(-90deg);
  }
  .rotate-right {
    display: inline-block;
    transform: rotate(90deg);
  }
  .rotate-down {
    display: inline-block;
    transform: rotate(180deg);
  }

  /* ── Reduced transparency: solid fallback for glass surfaces ── */
  @media (prefers-reduced-transparency: reduce) {
    .keybar {
      background: var(--bg-elevated);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
    .arrow-overlay {
      background: var(--bg-elevated);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }

  /* ── Reduced motion: instant transitions ── */
  @media (prefers-reduced-motion: reduce) {
    .key {
      transition: none;
    }
    .scroll-wrapper::before,
    .scroll-wrapper::after {
      transition: none;
    }
    .scroll-hint {
      animation: none;
    }
    .key:active {
      transform: none;
    }
  }
</style>
