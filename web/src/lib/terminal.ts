import { terminalManagers } from './zoomStore.svelte';
import { get } from 'svelte/store';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { workspace } from './workspace';
import { appView } from './appView';
import { showBrowserNotification } from './notifications';
import '@xterm/xterm/css/xterm.css';

type OpencodeNotifyType =
  | 'permission_requested'
  | 'permission_resolved'
  | 'question_requested'
  | 'question_resolved'
  | 'session_idle'
  | 'dialog_finished';

interface OpencodeNotifyPayload {
  type: OpencodeNotifyType;
  sessionId: string;
  title?: string;
  projectName?: string;
  permissionId?: string | null;
  questionId?: string | null;
  timestamp?: string;
}

export type TerminalConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

interface TextareaFocusChangeRegistration {
  textarea: HTMLTextAreaElement;
  onFocus: () => void;
  onBlur: () => void;
}

interface InputTransformState {
  transform: (data: string) => string;
  timeoutId: number;
}

const OPENCODE_NOTIFY_TYPES: ReadonlySet<OpencodeNotifyType> = new Set([
  'permission_requested',
  'permission_resolved',
  'question_requested',
  'question_resolved',
  'session_idle',
  'dialog_finished',
]);

const NOTIFY_DEDUPE_WINDOW_MS = 2_000;
const recentNotificationKeys = new Map<string, number>();
function shouldHandleNotification(payload: OpencodeNotifyPayload): boolean {
  const key = [
    payload.type,
    payload.sessionId,
    payload.permissionId ?? '-',
    payload.questionId ?? '-',
    payload.timestamp ?? '-',
  ].join(':');

  const now = Date.now();
  const previous = recentNotificationKeys.get(key);
  if (typeof previous === 'number' && now - previous < NOTIFY_DEDUPE_WINDOW_MS) {
    return false;
  }

  recentNotificationKeys.set(key, now);

  for (const [entry, seenAt] of recentNotificationKeys) {
    if (now - seenAt > NOTIFY_DEDUPE_WINDOW_MS * 2) {
      recentNotificationKeys.delete(entry);
    }
  }

  return true;
}

export function refreshAllManagers() {
  requestAnimationFrame(() => {
    for (const manager of terminalManagers) {
      manager._webglAddon?.clearTextureAtlas();
      manager.terminal.refresh(0, manager.terminal.rows - 1);
      const currentFontSize = manager.terminal.options.fontSize ?? 14;
      manager.terminal.options.fontSize = currentFontSize;
    }
  });
}

export class TerminalManager {
  terminal: Terminal;
  fitAddon: FitAddon;
  private customKeyEventHandler: ((event: KeyboardEvent) => boolean) | null = null;
  private ws: WebSocket | null = null;
  private connectionStatus: TerminalConnectionStatus = 'disconnected';
  private connectionStatusListeners = new Set<(status: TerminalConnectionStatus) => void>();
  private hasConnectedOnce = false;
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
  private _selectionChangeDisposable: { dispose(): void } | null = null;
  private _copyListener: ((event: ClipboardEvent) => void) | null = null;
  private _writeParsedDisposable: { dispose(): void } | null = null;
  private _textareaFocusChangeRegistrations = new Set<TextareaFocusChangeRegistration>();
  private _xtermViewport: HTMLElement | null = null;
  private _xtermViewportScrollListener: (() => void) | null = null;
  private lastViewportScrollTop = 0;
  private selectedText = '';
  private lastAttentionClearAt = 0;
  private pinnedToBottom = false;
  private inputTransform: InputTransformState | null = null;
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

    this.terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (this.customKeyEventHandler && !this.customKeyEventHandler(event)) {
        return false;
      }

      return this.handleDefaultCustomKeyEvent(event);
    });

    this._selectionChangeDisposable = this.terminal.onSelectionChange(() => {
      this.selectedText = this.terminal.getSelection();
    });

    this.terminal.onData((data) => this.onData(data));
    this._writeParsedDisposable = this.terminal.onWriteParsed(() => {
      if (!this.pinnedToBottom) {
        return;
      }

      this.terminal.scrollToBottom();
    });

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

  private handleDefaultCustomKeyEvent(event: KeyboardEvent): boolean {
    const isCopyShortcut =
      event.type === 'keydown' &&
      !event.altKey &&
      !event.shiftKey &&
      (event.key === 'c' || event.key === 'C') &&
      (event.ctrlKey || event.metaKey);

    if (isCopyShortcut && this.terminal.hasSelection()) {
      event.preventDefault();
      void this.copySelectionToClipboard();
      return false;
    }

    // Alt+Arrow: virtual display switching
    if (
      event.altKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.metaKey &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
      event.type === 'keydown'
    ) {
      // Re-dispatch on document so TerminalGrid's svelte:window handler fires
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: event.key,
          altKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      return false; // prevent xterm from processing
    }

    // F11: PWA fullscreen
    if (event.key === 'F11' && event.type === 'keydown') {
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
  }

  attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void {
    this.customKeyEventHandler = handler;
  }

  clearCustomKeyEventHandler(): void {
    this.customKeyEventHandler = null;
  }

  async open(): Promise<void> {
    await document.fonts.ready;
    await document.fonts.load('14px "JetBrains Mono"');
    this.terminal.open(this.element);

    const xtermViewport = this.element.querySelector<HTMLElement>('.xterm-viewport');
    if (xtermViewport) {
      this._xtermViewport = xtermViewport;
      this.lastViewportScrollTop = xtermViewport.scrollTop;
      this._xtermViewportScrollListener = () => {
        const currentScrollTop = xtermViewport.scrollTop;
        const userScrolledUp = currentScrollTop < this.lastViewportScrollTop;
        this.lastViewportScrollTop = currentScrollTop;

        if (userScrolledUp && !this.isViewportNearBottom()) {
          this.pinnedToBottom = false;
        }
      };
      xtermViewport.addEventListener('scroll', this._xtermViewportScrollListener, {
        passive: true,
      });
    }

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

    this._copyListener = (event: ClipboardEvent) => {
      this.handleCopyEvent(event);
    };
    this.element.addEventListener('copy', this._copyListener);
  }

  private handleCopyEvent(event: ClipboardEvent): void {
    if (!this.terminal.hasSelection()) {
      return;
    }

    const text = this.selectedText || this.terminal.getSelection();
    if (!text) {
      return;
    }

    event.preventDefault();

    if (event.clipboardData) {
      event.clipboardData.setData('text/plain', text);
      return;
    }

    void this.writeClipboardText(text);
  }

  private async copySelectionToClipboard(): Promise<void> {
    const text = this.selectedText || this.terminal.getSelection();
    if (!text) {
      return;
    }

    await this.writeClipboardText(text);
  }

  private async writeClipboardText(text: string): Promise<void> {
    if (!navigator.clipboard?.writeText) {
      console.warn('Clipboard API unavailable; unable to copy terminal selection');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.warn('Failed to copy terminal selection to clipboard', error);
    }
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
    this.pinnedToBottom = false;
    this.hasConnectedOnce = false;
    this.setConnectionStatus('disconnected');
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.sessionId = sessionId;
    this.connectWs();
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  hasEstablishedConnection(): boolean {
    return this.hasConnectedOnce;
  }

  getConnectionStatus(): TerminalConnectionStatus {
    return this.connectionStatus;
  }

  onConnectionStatusChange(handler: (status: TerminalConnectionStatus) => void): () => void {
    this.connectionStatusListeners.add(handler);
    handler(this.connectionStatus);

    return () => {
      this.connectionStatusListeners.delete(handler);
    };
  }

  reconnectIfDisconnected(): void {
    if (!this.sessionId || this.exited) {
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.attemptReconnect();
  }

  private setConnectionStatus(status: TerminalConnectionStatus): void {
    if (this.connectionStatus === status) {
      return;
    }

    this.connectionStatus = status;
    for (const listener of this.connectionStatusListeners) {
      listener(status);
    }
  }

  private attemptReconnect(): void {
    if (!this.sessionId || this.exited) {
      return;
    }

    this.setConnectionStatus('reconnecting');
    this.connectWs();
  }

  private connectWs() {
    if (!this.sessionId) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/sessions/${this.sessionId}/stream?cols=${this.terminal.cols}&rows=${this.terminal.rows}`;

    const socket = new WebSocket(wsUrl);
    this.ws = socket;
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
      if (this.ws !== socket) {
        return;
      }
      this.streamReady = false;
      this.hasConnectedOnce = true;
      this.setConnectionStatus('connected');
      socket.send(
        JSON.stringify({ type: 'hello', cols: this.terminal.cols, rows: this.terminal.rows }),
      );
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
    };

    socket.onmessage = (event) => {
      if (this.ws !== socket) {
        return;
      }

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

        const handledNotify = this.handleNotifyFrame(typed);
        if (handledNotify) {
          return;
        }

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
          socket.close();
        } else if (typed.type === 'error') {
          this.terminal.writeln(`\x1b[31mError: ${typed.message ?? 'unknown error'}\x1b[0m`);
          if (!this.streamReady) {
            this.markSessionEnded('Session ended', 1);
            socket.close();
          }
        }
      } else {
        this.terminal.write(new Uint8Array(event.data));
      }
    };

    socket.onclose = () => {
      if (this.ws !== socket) {
        return;
      }

      this.ws = null;

      if (this.sessionId && !this.streamReady && !this.exited) {
        this.markSessionEnded('Session ended', 1);
        return;
      }

      if (this.sessionId && !this.exited) {
        this.setConnectionStatus('disconnected');
        this.reconnectTimeout = window.setTimeout(() => {
          this.reconnectTimeout = null;
          this.attemptReconnect();
        }, 2000);
      }
    };

    socket.onerror = (event) => {
      if (this.ws !== socket) {
        return;
      }
      console.error('WebSocket error for session', this.sessionId, event);
      this.terminal.writeln('\x1b[31mWebSocket connection error\x1b[0m');
    };
  }

  disconnect(): void {
    this.sessionId = null;
    this.streamReady = false;
    this.pinnedToBottom = false;
    this.clearInputTransform();
    this.setConnectionStatus('disconnected');
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
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

    const shouldKeepBottomPinned = this.pinnedToBottom || this.isViewportNearBottom();

    try {
      this.fitAddon.fit();
      if (shouldKeepBottomPinned) {
        this.terminal.scrollToBottom();
      }
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
    const transformedData = this.applyInputTransform(data);
    if (!transformedData) {
      return;
    }

    this.clearAttentionFromUserInput(transformedData);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'input', data: transformedData }));
      this.pinnedToBottom = true;
    }
  }

  write(data: string): void {
    this.onData(data);
  }

  setInputTransform(transform: (data: string) => string, timeout: number): void {
    this.clearInputTransform();

    const timeoutId = window.setTimeout(() => {
      if (this.inputTransform?.timeoutId !== timeoutId) {
        return;
      }

      this.clearInputTransform();
    }, timeout);

    this.inputTransform = {
      transform,
      timeoutId,
    };
  }

  clearInputTransform(): void {
    if (!this.inputTransform) {
      return;
    }

    window.clearTimeout(this.inputTransform.timeoutId);
    this.inputTransform = null;
  }

  private applyInputTransform(data: string): string {
    if (!this.inputTransform) {
      return data;
    }

    const { transform } = this.inputTransform;
    this.clearInputTransform();
    return transform(data);
  }

  private isViewportNearBottom(thresholdLines = 2): boolean {
    const activeBuffer = this.terminal.buffer.active;
    return activeBuffer.baseY - activeBuffer.viewportY <= thresholdLines;
  }

  private clearAttentionFromUserInput(data: string): void {
    if (!this.sessionId || typeof data !== 'string' || data.length === 0) {
      return;
    }

    if (/^[\r\n\t]*$/.test(data)) {
      return;
    }

    const state = get(workspace);
    const tab = state.tabs.find((candidate) => candidate.sessionId === this.sessionId);
    if (!tab || !tab.attention || tab.attention === 'none') {
      return;
    }

    const now = Date.now();
    if (now - this.lastAttentionClearAt < 250) {
      return;
    }

    this.lastAttentionClearAt = now;
    workspace.updateTabAttention(this.sessionId, 'none');
  }

  private handleNotifyFrame(msg: { type?: unknown; sessionId?: unknown; data?: unknown }): boolean {
    if (!msg || typeof msg !== 'object') {
      return false;
    }

    if (
      typeof msg.type !== 'string' ||
      !OPENCODE_NOTIFY_TYPES.has(msg.type as OpencodeNotifyType)
    ) {
      return false;
    }

    const topLevelSessionId = typeof msg.sessionId === 'string' ? msg.sessionId : undefined;
    const dataObj =
      msg.data && typeof msg.data === 'object' ? (msg.data as Record<string, unknown>) : {};
    const payload: OpencodeNotifyPayload = {
      type: msg.type as OpencodeNotifyType,
      sessionId:
        topLevelSessionId ??
        (typeof dataObj.sessionId === 'string' ? dataObj.sessionId : (this.sessionId ?? '')),
      title: typeof dataObj.title === 'string' ? dataObj.title : undefined,
      projectName: typeof dataObj.projectName === 'string' ? dataObj.projectName : undefined,
      permissionId: typeof dataObj.permissionId === 'string' ? dataObj.permissionId : null,
      questionId: typeof dataObj.questionId === 'string' ? dataObj.questionId : null,
      timestamp: typeof dataObj.timestamp === 'string' ? dataObj.timestamp : undefined,
    };

    if (!payload.sessionId) {
      return true;
    }

    if (!shouldHandleNotification(payload)) {
      return true;
    }

    const isTabActive =
      document.visibilityState === 'visible' &&
      document.hasFocus() &&
      get(appView) === 'workspace' &&
      get(workspace).activeTabId === payload.sessionId;

    switch (payload.type) {
      case 'permission_requested': {
        if (!isTabActive) {
          workspace.updateTabAttention(
            payload.sessionId,
            'permission',
            payload.permissionId ?? undefined,
          );
        }
        this.maybeNotify(
          payload,
          'Permission requested',
          'OpenCode is waiting for permission input',
        );
        return true;
      }
      case 'question_requested': {
        if (!isTabActive) {
          workspace.updateTabAttention(
            payload.sessionId,
            'question',
            payload.questionId ?? undefined,
          );
        }
        this.maybeNotify(payload, 'Question requested', 'OpenCode is waiting for your answer');
        return true;
      }
      case 'permission_resolved':
      case 'question_resolved':
      case 'session_idle': {
        workspace.updateTabAttention(payload.sessionId, 'none');
        return true;
      }
      case 'dialog_finished': {
        this.maybeNotify(payload, 'Dialog finished', 'OpenCode dialog is finished');
        return true;
      }
      default:
        return true;
    }
  }

  private maybeNotify(
    payload: OpencodeNotifyPayload,
    fallbackTitle: string,
    fallbackBody: string,
  ): void {
    if (
      document.visibilityState === 'visible' &&
      document.hasFocus() &&
      get(appView) === 'workspace' &&
      get(workspace).activeTabId === payload.sessionId
    ) {
      return;
    }

    const title = payload.title ?? fallbackTitle;
    void showBrowserNotification(title, fallbackBody, payload.sessionId, payload.projectName);
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
    this.setConnectionStatus('disconnected');
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

  onTextareaFocusChange(handler: (focused: boolean) => void): () => void {
    const textarea = this._xtermTextarea;
    if (!textarea) {
      return () => {
        // no-op: textarea not available yet
      };
    }

    const onFocus = () => {
      handler(true);
    };
    const onBlur = () => {
      handler(false);
    };

    textarea.addEventListener('focus', onFocus);
    textarea.addEventListener('blur', onBlur);

    const registration: TextareaFocusChangeRegistration = {
      textarea,
      onFocus,
      onBlur,
    };
    this._textareaFocusChangeRegistrations.add(registration);

    return () => {
      if (!this._textareaFocusChangeRegistrations.delete(registration)) {
        return;
      }
      textarea.removeEventListener('focus', onFocus);
      textarea.removeEventListener('blur', onBlur);
    };
  }

  private cleanupTextareaFocusChangeRegistrations(): void {
    for (const registration of this._textareaFocusChangeRegistrations) {
      registration.textarea.removeEventListener('focus', registration.onFocus);
      registration.textarea.removeEventListener('blur', registration.onBlur);
    }
    this._textareaFocusChangeRegistrations.clear();
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

    this.cleanupTextareaFocusChangeRegistrations();

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

    if (this._selectionChangeDisposable) {
      this._selectionChangeDisposable.dispose();
      this._selectionChangeDisposable = null;
    }

    if (this._copyListener) {
      this.element.removeEventListener('copy', this._copyListener);
      this._copyListener = null;
    }

    if (this._xtermViewport && this._xtermViewportScrollListener) {
      this._xtermViewport.removeEventListener('scroll', this._xtermViewportScrollListener);
      this._xtermViewportScrollListener = null;
      this._xtermViewport = null;
    }

    if (this._writeParsedDisposable) {
      this._writeParsedDisposable.dispose();
      this._writeParsedDisposable = null;
    }

    this.connectionStatusListeners.clear();

    this.disconnect();
    this.terminal.dispose();
  }
}
