import { terminalManagers } from './zoomStore.svelte';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export class TerminalManager {
  terminal: Terminal;
  fitAddon: FitAddon;
  private ws: WebSocket | null = null;
  private onExitCb?: (code: number) => void;
  private sessionId: string | null = null;
  element: HTMLElement;
  private reconnectTimeout: number | null = null;
  private fitTimer: number | null = null;
  private fitVisibilityTimer: number | null = null;
  private touchElement: HTMLElement | null = null;
  private touchStartListener: ((e: TouchEvent) => void) | null = null;
  private touchMoveListener: ((e: TouchEvent) => void) | null = null;
  private exited = false;
  private streamReady = false;
  private lastSentCols = 0;
  private lastSentRows = 0;
  private _handleFocusRefresh?: () => void;
  private _handleBlurRefresh?: () => void;
  private _handleVisibilityChange?: () => void;
  private _xtermTextarea: HTMLTextAreaElement | null = null;
  private _originalTextareaFocus: (() => void) | null = null;
  _webglAddon?: import('@xterm/addon-webgl').WebglAddon;

  constructor(element: HTMLElement, cols: number, rows: number) {
    this.element = element;
    this.terminal = new Terminal({
      cols,
      rows,
      cursorBlink: true,
      scrollback: 10000,
      allowProposedApi: true,
      altClickMovesCursor: false,
      macOptionIsMeta: true,
      rescaleOverlappingGlyphs: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 14,
      lineHeight: 1.0,
      letterSpacing: 0,
      fontWeight: 'normal',
      fontWeightBold: 'bold',
      drawBoldTextInBrightColors: false,
      minimumContrastRatio: 1,
      overviewRuler: { width: 0 },
      customGlyphs: true,
      allowTransparency: false,
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
      },
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);

    this.terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      // Alt+Arrow: virtual display switching
      if (
        e.altKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.metaKey &&
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        e.type === 'keydown'
      ) {
        // Re-dispatch on document so TerminalGrid's svelte:window handler fires
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: e.key,
            altKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
        return false; // prevent xterm from processing
      }
      // F11: PWA fullscreen
      if (e.key === 'F11' && e.type === 'keydown') {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'F11',
            bubbles: true,
            cancelable: true,
          }),
        );
        return false;
      }
      return true;
    });

    this.terminal.onData((data) => this.onData(data));
    this.terminal.onResize((size) => {
      // Save dimensions for next session launch
      try {
        localStorage.setItem('termLastCols', String(size.cols));
        localStorage.setItem('termLastRows', String(size.rows));
      } catch {
        // intentional
      }

      // Deduplicate: don't send if dims unchanged
      if (size.cols === this.lastSentCols && size.rows === this.lastSentRows) return;
      this.lastSentCols = size.cols;
      this.lastSentRows = size.rows;

      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'resize', cols: size.cols, rows: size.rows }));
      }
    });
  }

  async open(): Promise<void> {
    await document.fonts.ready;
    await document.fonts.load('14px "JetBrains Mono"');
    this.terminal.open(this.element);

    // On touch devices: suppress automatic virtual keyboard by overriding textarea.focus().
    // The ⌨ button in MobileKeybar calls enableTextareaFocus() before focusing.
    const xtermTextarea = this.element.querySelector('textarea');
    if (xtermTextarea) {
      xtermTextarea.setAttribute('inputmode', 'none');
      xtermTextarea.tabIndex = -1;
      this._xtermTextarea = xtermTextarea;
      if (window.matchMedia('(pointer: coarse)').matches) {
        // Save original focus and replace with no-op
        this._originalTextareaFocus = xtermTextarea.focus.bind(xtermTextarea);
        xtermTextarea.focus = () => {
          // no-op: keyboard managed manually via ⌨ button
        };
      }
    }

    // Unicode 11 support: TUI apps use modern box-drawing and wide chars that
    // xterm.js mishandles with its default Unicode 6 tables.
    const { Unicode11Addon } = await import('@xterm/addon-unicode11');
    const unicode11Addon = new Unicode11Addon();
    this.terminal.loadAddon(unicode11Addon);
    this.terminal.unicode.activeVersion = '11';

    // Try WebGL first — fallback is xterm's built-in DOM renderer
    try {
      const { WebglAddon } = await import('@xterm/addon-webgl');
      const webglAddon = new WebglAddon();
      // If WebGL context is lost (e.g., GPU reset), xterm falls back to built-in DOM renderer.
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
        this._webglAddon = undefined;
      });
      this.terminal.loadAddon(webglAddon);
      this._webglAddon = webglAddon;
    } catch (e) {
      console.warn('WebglAddon unavailable, using built-in DOM renderer:', e);
    }

    const refreshAllManagers = () => {
      requestAnimationFrame(() => {
        for (const manager of terminalManagers) {
          // Clear WebGL texture atlas to force full GPU re-upload
          manager._webglAddon?.clearTextureAtlas();
          // Trigger xterm's full viewport refresh
          manager.terminal.refresh(0, manager.terminal.rows - 1);
          // Force xterm to re-evaluate character cell sizes and redraw
          // This invalidates xterm's internal renderer state completely
          const currentFontSize = manager.terminal.options.fontSize ?? 14;
          manager.terminal.options.fontSize = currentFontSize;
        }
      });
    };

    window.addEventListener('focus', (this._handleFocusRefresh = refreshAllManagers));

    window.addEventListener('blur', (this._handleBlurRefresh = refreshAllManagers));

    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        refreshAllManagers();
      }
    };
    this._handleVisibilityChange = visibilityHandler;
    document.addEventListener('visibilitychange', visibilityHandler);

    this.setupTouchScroll(this.element);
  }

  private setupTouchScroll(element: HTMLElement): void {
    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const touch = e.touches[0];
      const currentY = touch.clientY;
      const deltaY = startY - currentY; // positive = swipe up
      startY = currentY;

      // Dismiss virtual keyboard when user starts scrolling
      if (
        Math.abs(deltaY) > 3 &&
        document.activeElement &&
        document.activeElement !== document.body
      ) {
        (document.activeElement as HTMLElement).blur();
      }

      if (Math.abs(deltaY) > 0) {
        const target = e.target as HTMLElement;
        target.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: deltaY * 1.5,
            clientX: touch.clientX,
            clientY: touch.clientY,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    };

    const onTouchEnd = () => {
      // noop
    };

    // Use CAPTURE PHASE so we receive events before xterm's own handlers
    // (xterm may call stopPropagation in bubble phase, but capture fires first)
    element.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
    element.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    element.addEventListener('touchend', onTouchEnd, { capture: true });

    // Store for cleanup
    this.touchElement = element;
    this.touchStartListener = onTouchStart as EventListener;
    this.touchMoveListener = onTouchMove as EventListener;
    (this as { touchEndListener?: EventListener }).touchEndListener = onTouchEnd as EventListener;
  }

  connect(sessionId: string): void {
    this.exited = false;
    this.streamReady = false;
    this.sessionId = sessionId;
    this.connectWs();
  }

  private connectWs() {
    if (!this.sessionId) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/sessions/${this.sessionId}/stream?cols=${this.terminal.cols}&rows=${this.terminal.rows}`;

    this.ws = new WebSocket(wsUrl);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      this.streamReady = false;
      this.ws?.send(
        JSON.stringify({ type: 'hello', cols: this.terminal.cols, rows: this.terminal.rows }),
      );
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
    };

    this.ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        let msg: unknown;
        try {
          msg = JSON.parse(event.data);
        } catch {
          this.terminal.write(event.data);
          return;
        }

        if (!msg || typeof msg !== 'object' || !('type' in msg)) {
          return;
        }

        const typed = msg as { type: string; message?: string; exitCode?: number; status?: string };

        if (typed.type === 'ready') {
          this.streamReady = true;
          return;
        }

        if (typed.type === 'status') {
          if (
            !this.exited &&
            (typed.status === 'exited' ||
              typed.status === 'failed' ||
              typed.status === 'interrupted')
          ) {
            this.markSessionEnded(`Session ended (${typed.status})`, 1);
          }
          return;
        }

        if (typed.type === 'exit') {
          this.exited = true;
          this.terminal.writeln(`\r\n\x1b[33mSession ended (code ${typed.exitCode})\x1b[0m`);
          this.sessionId = null;
          if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
          }
          this.onExitCb?.(typed.exitCode ?? 1);
          this.ws?.close();
        } else if (typed.type === 'error') {
          this.terminal.writeln(`\x1b[31mError: ${typed.message ?? 'unknown error'}\x1b[0m`);
          if (!this.streamReady) {
            this.markSessionEnded('Session ended', 1);
            this.ws?.close();
          }
        }
      } else {
        this.terminal.write(new Uint8Array(event.data));
      }
    };

    this.ws.onclose = () => {
      if (this.sessionId && !this.streamReady && !this.exited) {
        this.markSessionEnded('Session ended', 1);
        return;
      }

      if (this.sessionId && !this.exited) {
        this.reconnectTimeout = window.setTimeout(() => this.connectWs(), 2000);
      }
    };

    this.ws.onerror = (event) => {
      console.error('WebSocket error for session', this.sessionId, event);
      this.terminal.writeln('\x1b[31mWebSocket connection error\x1b[0m');
    };
  }

  disconnect(): void {
    this.sessionId = null;
    this.streamReady = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  fit(): void {
    if (this.element.clientWidth <= 0 || this.element.clientHeight <= 0) {
      return;
    }

    try {
      this.fitAddon.fit();
      if (this._webglAddon) {
        this._webglAddon.clearTextureAtlas();
      }
      try {
        localStorage.setItem('termLastCols', String(this.terminal.cols));
        localStorage.setItem('termLastRows', String(this.terminal.rows));
      } catch {
        // intentional
      }
    } catch (e) {
      console.warn('FitAddon error:', e);
    }
  }

  scheduleFit(delay = 100): void {
    if (this.fitTimer) {
      window.clearTimeout(this.fitTimer);
    }

    this.fitTimer = window.setTimeout(() => {
      this.fitTimer = null;
      this.fit();
    }, delay);
  }

  fitWhenReady(retries = 10, delay = 50): void {
    if (this.element.clientWidth > 0 && this.element.clientHeight > 0) {
      this.scheduleFit(0);
      return;
    }

    if (retries <= 0) {
      return;
    }

    if (this.fitVisibilityTimer) {
      window.clearTimeout(this.fitVisibilityTimer);
    }

    this.fitVisibilityTimer = window.setTimeout(() => {
      this.fitVisibilityTimer = null;
      this.fitWhenReady(retries - 1, delay);
    }, delay);
  }

  onData(data: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'input', data }));
    }
  }

  onExit(cb: (code: number) => void): void {
    this.onExitCb = cb;
  }

  private markSessionEnded(message: string, code: number): void {
    if (this.exited) {
      return;
    }

    this.exited = true;
    this.terminal.writeln(`\r\n\x1b[33m${message}\x1b[0m`);
    this.sessionId = null;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.onExitCb?.(code);
  }

  setFontSize(size: number): void {
    this.terminal.options.fontSize = size;
    this.scheduleFit(50);
  }

  toggleMobileKeyboard(): void {
    if (!this._xtermTextarea || !this._originalTextareaFocus) return;
    const ta = this._xtermTextarea;
    const isKeyboardOpen = window.visualViewport
      ? window.innerHeight - window.visualViewport.height > 100
      : false;
    if (isKeyboardOpen) {
      // Close: blur the textarea and re-suppress focus
      ta.focus = () => {
        /* no-op */
      };
      ta.setAttribute('inputmode', 'none');
      ta.blur();
    } else {
      // Open: restore real focus method, set inputmode=text, and focus
      ta.focus = this._originalTextareaFocus;
      ta.setAttribute('inputmode', 'text');
      ta.focus();
      // Do NOT re-apply no-op here — keyboard stays open until next toggle
    }
  }

  dispose(): void {
    if (this._handleFocusRefresh) {
      window.removeEventListener('focus', this._handleFocusRefresh);
    }
    if (this._handleBlurRefresh) {
      window.removeEventListener('blur', this._handleBlurRefresh);
    }
    if (this._handleVisibilityChange) {
      document.removeEventListener('visibilitychange', this._handleVisibilityChange);
    }

    // Restore textarea focus method if overridden
    if (this._xtermTextarea && this._originalTextareaFocus) {
      this._xtermTextarea.focus = this._originalTextareaFocus;
      this._xtermTextarea = null;
      this._originalTextareaFocus = null;
    }
    if (this.fitTimer) {
      window.clearTimeout(this.fitTimer);
      this.fitTimer = null;
    }
    if (this.fitVisibilityTimer) {
      window.clearTimeout(this.fitVisibilityTimer);
      this.fitVisibilityTimer = null;
    }

    if (this.touchElement && this.touchStartListener) {
      this.touchElement.removeEventListener('touchstart', this.touchStartListener, {
        capture: true,
      });
    }
    if (this.touchElement && this.touchMoveListener) {
      this.touchElement.removeEventListener('touchmove', this.touchMoveListener, { capture: true });
    }
    if (this.touchElement && (this as { touchEndListener?: EventListener }).touchEndListener) {
      this.touchElement.removeEventListener(
        'touchend',
        (this as { touchEndListener?: EventListener }).touchEndListener as EventListener,
        {
          capture: true,
        },
      );
    }
    this.touchElement = null;
    this.touchStartListener = null;
    this.touchMoveListener = null;

    this.disconnect();
    this.terminal.dispose();
  }
}
