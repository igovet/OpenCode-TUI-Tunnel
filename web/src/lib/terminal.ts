import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export class TerminalManager {
  terminal: Terminal;
  fitAddon: FitAddon;
  private ws: WebSocket | null = null;
  private onExitCb?: (code: number) => void;
  private sessionId: string | null = null;
  private element: HTMLElement;
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
  private _webglAddon?: import('@xterm/addon-webgl').WebglAddon;

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

    this.terminal.attachCustomKeyEventHandler(() => true);

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

    window.addEventListener(
      'focus',
      (this._handleFocusRefresh = () => {
        this.terminal.refresh(0, this.terminal.rows - 1);
      }),
    );

    this.setupTouchScroll(this.element);
  }

  private setupTouchScroll(element: HTMLElement): void {
    let startY = 0;
    let accumulatedDelta = 0;

    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
      accumulatedDelta = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const currentY = e.touches[0].clientY;
      const deltaY = startY - currentY; // positive = swipe up = scroll forward (older content)
      startY = currentY; // reset for incremental scroll

      accumulatedDelta += deltaY;

      if (accumulatedDelta > 80) {
        if (this.terminal.buffer.active.type === 'alternate') {
          this.terminal.input('\x1b[B'); // arrow down
        } else {
          this.terminal.scrollLines(1);
        }
        accumulatedDelta -= 80;
      } else if (accumulatedDelta < -80) {
        if (this.terminal.buffer.active.type === 'alternate') {
          this.terminal.input('\x1b[A'); // arrow up
        } else {
          this.terminal.scrollLines(-1);
        }
        accumulatedDelta += 80;
      }
    };

    const onTouchEnd = () => {
      // noop or reset if needed
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

  dispose(): void {
    if (this._handleFocusRefresh) {
      window.removeEventListener('focus', this._handleFocusRefresh);
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
