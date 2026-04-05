import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { CanvasAddon } from '@xterm/addon-canvas';
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

  constructor(element: HTMLElement, cols: number, rows: number) {
    this.element = element;
    this.terminal = new Terminal({
      cols,
      rows,
      cursorBlink: true,
      scrollback: 10000,
      allowProposedApi: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 14,
      lineHeight: 1.0,
      letterSpacing: 0,
      fontWeight: 'normal',
      fontWeightBold: 'bold',
      drawBoldTextInBrightColors: false,
      overviewRulerWidth: 0,
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
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'resize', cols: size.cols, rows: size.rows }));
      }
    });
  }

  open(): void {
    this.terminal.open(this.element);

    // Use Canvas renderer for pixel-perfect TUI rendering on HiDPI screens
    try {
      const canvasAddon = new CanvasAddon();
      this.terminal.loadAddon(canvasAddon);
    } catch (e) {
      console.warn('CanvasAddon unavailable, falling back to DOM renderer:', e);
    }

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
        this.terminal.input('\x1b[6~'); // PageDown
        accumulatedDelta -= 80;
      } else if (accumulatedDelta < -80) {
        this.terminal.input('\x1b[5~'); // PageUp
        accumulatedDelta += 80;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
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
    (this as any).touchEndListener = onTouchEnd as EventListener;
  }

  connect(sessionId: string): void {
    this.exited = false;
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
        const msg = JSON.parse(event.data);
        if (msg.type === 'exit') {
          this.exited = true;
          this.terminal.writeln(`\r\n\x1b[33mSession ended (code ${msg.exitCode})\x1b[0m`);
          this.sessionId = null;
          if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
          }
          this.onExitCb?.(msg.exitCode);
          this.ws?.close();
        } else if (msg.type === 'error') {
          this.terminal.writeln(`\x1b[31mError: ${msg.message}\x1b[0m`);
        }
      } else {
        this.terminal.write(new Uint8Array(event.data));
      }
    };

    this.ws.onclose = () => {
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

  setFontSize(size: number): void {
    this.terminal.options.fontSize = size;
    this.scheduleFit(50);
  }

  dispose(): void {
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
    if (this.touchElement && (this as any).touchEndListener) {
      this.touchElement.removeEventListener('touchend', (this as any).touchEndListener, {
        capture: true,
      });
    }
    this.touchElement = null;
    this.touchStartListener = null;
    this.touchMoveListener = null;

    this.disconnect();
    this.terminal.dispose();
  }
}
