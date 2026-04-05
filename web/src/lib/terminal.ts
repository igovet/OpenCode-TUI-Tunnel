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
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
      },
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.open(element);
    this.terminal.attachCustomKeyEventHandler(() => true);

    this.terminal.onData((data) => this.onData(data));
    this.terminal.onResize((size) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'resize', cols: size.cols, rows: size.rows }));
      }
    });
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

  onData(data: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'input', data }));
    }
  }

  onExit(cb: (code: number) => void): void {
    this.onExitCb = cb;
  }

  dispose(): void {
    this.disconnect();
    this.terminal.dispose();
  }
}
