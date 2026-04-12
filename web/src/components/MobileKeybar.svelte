<script lang="ts">
  import { get } from 'svelte/store';
  import { activeTerminalRef } from '../lib/activeTerminal';

  type CtrlMode = 'idle' | 'ctrlSubmenuOpen' | 'awaitingCtrl' | 'awaitingCtrlXFollowup';

  let bottomOffset = $state(0);
  let isMobile = $state(false);
  let keyboardOpen = $state(false);
  let ctrlMode = $state<CtrlMode>('idle');
  let arrowPadOpen = $state(false);

  let scrollRef = $state<HTMLElement | null>(null);
  let scrolledLeft = $state(false);
  let scrolledRight = $state(true);

  let arrowTriggerRef = $state<HTMLButtonElement | null>(null);
  let hiddenCaptureInput = $state<HTMLInputElement | null>(null);
  let arrowOverlayLeft = $state(8);
  let ctrlXTimeout: ReturnType<typeof setTimeout> | null = null;

  function handleScroll() {
    if (!scrollRef) return;
    scrolledLeft = scrollRef.scrollLeft > 0;
    scrolledRight = Math.ceil(scrollRef.scrollLeft + scrollRef.clientWidth) < scrollRef.scrollWidth;
  }

  function triggerHaptic(durationMs = 8) {
    navigator.vibrate?.(durationMs);
  }

  function getActiveTerminal() {
    return get(activeTerminalRef);
  }

  function sendKey(seq: string) {
    const term = getActiveTerminal();
    if (term) {
      term.terminal.input(seq, true);
    }
  }

  function closeArrowOverlay() {
    arrowPadOpen = false;
  }

  function clearCtrlXTimeout() {
    if (ctrlXTimeout) {
      clearTimeout(ctrlXTimeout);
      ctrlXTimeout = null;
    }
  }

  function cleanupHiddenCaptureInput() {
    if (!hiddenCaptureInput) return;
    hiddenCaptureInput.blur();
    hiddenCaptureInput.remove();
    hiddenCaptureInput = null;
  }

  function clearAwaitingCtrlState() {
    clearCtrlXTimeout();
    cleanupHiddenCaptureInput();
  }

  function setCtrlMode(nextMode: CtrlMode) {
    if (nextMode === ctrlMode) return;

    if (ctrlMode === 'awaitingCtrl' || ctrlMode === 'awaitingCtrlXFollowup') {
      clearAwaitingCtrlState();
    }

    ctrlMode = nextMode;
    if (ctrlMode !== 'idle') {
      closeArrowOverlay();
    }
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

  function focusHiddenCaptureInput() {
    if (typeof document === 'undefined') return;

    clearAwaitingCtrlState();

    const input = document.createElement('input');
    input.type = 'text';
    input.style.cssText = 'position:fixed;opacity:0;left:-9999px;top:0;width:1px;height:1px;pointer-events:none;';
    input.autocapitalize = 'off';
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    input.className = 'ctrl-capture';
    document.body.appendChild(input);
    input.value = '';
    input.focus();

    hiddenCaptureInput = input;
  }

  function computeCtrlByteFromKey(event: KeyboardEvent): string | null {
    if (event.key.length !== 1) return null;

    const upper = event.key.toUpperCase();
    if (!/^[A-Z]$/.test(upper)) return null;

    return String.fromCharCode(upper.charCodeAt(0) - 64);
  }

  function mapCtrlXFollowup(event: KeyboardEvent): string | null {
    if (event.key === 'Enter') return '\r';
    if (event.key === 'Tab') return '\t';
    if (event.key === 'Backspace') return '\x7f';
    if (event.key === 'ArrowUp') return '\x1b[A';
    if (event.key === 'ArrowDown') return '\x1b[B';
    if (event.key === 'ArrowLeft') return '\x1b[D';
    if (event.key === 'ArrowRight') return '\x1b[C';
    if (event.key.length === 1) return event.key;
    return null;
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
      const term = getActiveTerminal();
      if (term && text) {
        for (let i = 0; i < text.length; i++) {
          term.terminal.input(text[i], true);
        }
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
    keyboardOpen = true;
    focusHiddenCaptureInput();
  }

  function handleCtrlP() {
    triggerHaptic();
    sendKey('\x10');
    setCtrlMode('idle');
  }

  function handleCtrlX() {
    triggerHaptic();
    sendKey('\x18');
    if (!keyboardOpen) {
      getActiveTerminal()?.toggleMobileKeyboard();
      keyboardOpen = true;
    }
    setCtrlMode('awaitingCtrlXFollowup');
    focusHiddenCaptureInput();
    clearCtrlXTimeout();
    ctrlXTimeout = setTimeout(() => {
      if (ctrlMode === 'awaitingCtrlXFollowup') {
        setCtrlMode('idle');
      }
    }, 500);
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
            keyboardOpen = window.innerHeight - window.visualViewport.height > 100;
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
            keyboardOpen = window.innerHeight - window.visualViewport.height > 100;
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

    const term = getActiveTerminal() as
      | (ReturnType<typeof getActiveTerminal> & {
          onTextareaFocusChange?: (listener: (focused: boolean) => void) => () => void;
        })
      | null;
    if (!term?.onTextareaFocusChange) return;

    const unsubscribeFocusChange = term.onTextareaFocusChange((focused: boolean) => {
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
        (target.closest('.keybar') || target.closest('.ctrl-capture') || target.closest('[data-arrow-overlay="true"]'));
      if (withinKeybar) return;

      resetExpansionAndCaptureState();
    };

    document.addEventListener('pointerdown', onDocumentPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onDocumentPointerDown);
    };
  });

  $effect(() => {
    if (!hiddenCaptureInput) return;

    const input = hiddenCaptureInput;

    const onFocus = () => {
      keyboardOpen = true;
      if (typeof window !== 'undefined' && window.visualViewport) {
        const viewportDelta =
          window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
        bottomOffset = Math.max(0, viewportDelta);
      }
    };

    const onBlur = () => {
      keyboardOpen = false;
      bottomOffset = 0;
      if (ctrlMode === 'awaitingCtrl' || ctrlMode === 'awaitingCtrlXFollowup') {
        setCtrlMode('idle');
      }
    };

    const onKeydown = (event: KeyboardEvent) => {
      if (ctrlMode !== 'awaitingCtrl' && ctrlMode !== 'awaitingCtrlXFollowup') return;

      if (event.key === 'Escape') {
        event.preventDefault();
        setCtrlMode('idle');
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (ctrlMode === 'awaitingCtrl') {
        const byte = computeCtrlByteFromKey(event);
        if (!byte) return;

        event.preventDefault();
        triggerHaptic();
        sendKey(byte);
        setCtrlMode('idle');
        return;
      }

      const followup = mapCtrlXFollowup(event);
      if (!followup) return;

      event.preventDefault();
      triggerHaptic();
      sendKey(followup);
      setCtrlMode('idle');
    };

    input.addEventListener('focus', onFocus);
    input.addEventListener('blur', onBlur);
    input.addEventListener('keydown', onKeydown);

    return () => {
      input.removeEventListener('focus', onFocus);
      input.removeEventListener('blur', onBlur);
      input.removeEventListener('keydown', onKeydown);
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
            class="key {(ctrlMode === 'awaitingCtrl' || ctrlMode === 'awaitingCtrlXFollowup') ? 'ctrl-active' : ''}"
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
    </div>

    {#if arrowPadOpen}
      <div
        data-arrow-overlay="true"
        style="position: fixed; z-index: 10001; left: {arrowOverlayLeft}px; bottom: {bottomOffset + 48}px; display: flex; flex-direction: column; gap: 4px; padding: 6px; background: #1a1a1a; border: 1px solid #333; box-shadow: 0 8px 20px rgb(0 0 0 / 45%);"
      >
        <div style="display: flex; justify-content: center; gap: 4px;">
          <button
            class="key arrow"
            tabindex="-1"
            onmousedown={(e) => e.preventDefault()}
            onclick={() => handleArrowInput('\x1b[A')}
          >↑</button>
        </div>
        <div style="display: flex; justify-content: center; gap: 4px;">
          <button
            class="key arrow"
            tabindex="-1"
            onmousedown={(e) => e.preventDefault()}
            onclick={() => handleArrowInput('\x1b[D')}
          ><span style="display: inline-block; transform: rotate(-90deg);">↑</span></button>
          <button
            class="key arrow"
            tabindex="-1"
            onmousedown={(e) => e.preventDefault()}
            onclick={() => handleArrowInput('\x1b[B')}
          ><span style="display: inline-block; transform: rotate(180deg);">↑</span></button>
          <button
            class="key arrow"
            tabindex="-1"
            onmousedown={(e) => e.preventDefault()}
            onclick={() => handleArrowInput('\x1b[C')}
          ><span style="display: inline-block; transform: rotate(90deg);">↑</span></button>
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
