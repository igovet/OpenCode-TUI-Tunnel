<script lang="ts">
  import { get } from 'svelte/store';
  import { requestedWorkspacePage } from './lib/workspacePage';
  import { workspace } from './lib/workspace';
  import { appView } from './lib/appView';
  import { getSession } from './lib/api';
  import {
    ACTIVATE_SESSION_EVENT,
    consumeRequestedSessionActivation,
    dispatchSessionActivation,
    isActivateSessionPayload,
    setupNotificationAudioUnlock,
  } from './lib/notifications';
  import SessionList from './pages/SessionList.svelte';
  import WorkspaceView from './pages/WorkspaceView.svelte';
  import SessionTabs from './components/SessionTabs.svelte';
  import ToastProvider from './components/ui/ToastProvider.svelte';
  import { getSettings, type Settings } from './lib/settings';
  
  // Navigation between home and workspace
  let currentView: 'home' | 'workspace' = $state('home');

  // ── Settings → global DOM attributes ──
  // Apply reduceMotion and uiFontSize as data-attributes on <html> so
  // theme.css attribute-selector rules can react without per-component wiring.
  // localStorage 'storage' events keep sibling tabs in sync; the effect also
  // re-reads on mount.
  function applySettingsAttributes(s: Settings) {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.reduceMotion = String(s.reduceMotion);
    document.documentElement.dataset.uiFontSize = s.uiFontSize;
  }

  $effect(() => {
    applySettingsAttributes(getSettings());
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === 'opencode-tui-settings') {
        applySettingsAttributes(getSettings());
      }
    });
  }

  $effect(() => {
    appView.set(currentView);
  });

  function goHome() { currentView = 'home'; }
  function goWorkspace() { if ($workspace.tabs.length > 0) currentView = 'workspace'; }
  
  // Auto-switch to workspace when a tab is opened
  $effect(() => {
    if ($workspace.tabs.length > 0 && $workspace.activeTabId) {
      currentView = 'workspace';
    }
  });
  
  // Auto-switch to home when all tabs are closed
  $effect(() => {
    if ($workspace.tabs.length === 0) {
      currentView = 'home';
    }
  });

  // View-transition focus management (concept §5.1). When currentView changes,
  // move focus to the new view's primary heading or first focusable element so
  // screen-reader and keyboard users land on the new context, not the
  // previously-focused control in the old view. A small tick via rAF lets the
  // DOM settle before querying the focus target.
  let handledInitialView = false;
  $effect(() => {
    // Reading currentView establishes the reactive dependency so this effect
    // re-runs on every view transition. The value is consumed implicitly via
    // the focus-target query below; `void` discards the binding while keeping
    // the read for the dependency tracker.
    void currentView;
    // Skip the initial mount — only manage focus on actual view transitions.
    if (!handledInitialView) {
      handledInitialView = true;
      return;
    }
    // Defer to next frame so the view's markup is mounted.
    const id = requestAnimationFrame(() => {
      const main = document.getElementById('main-content');
      if (!main) return;
      // Prefer an explicit heading marked focusable, then any heading, then
      // the first interactive element.
      const target =
        main.querySelector<HTMLElement>('h1[data-view-focus], h2[data-view-focus]') ??
        main.querySelector<HTMLElement>('h1, h2') ??
        main.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
      if (target) {
        // Headings are not focusable by default; make this one programmatically
        // focusable without adding it to the tab order (tabindex=-1).
        if (target.tagName === 'H1' || target.tagName === 'H2') {
          target.tabIndex = -1;
        }
        target.focus();
      }
    });
    return () => cancelAnimationFrame(id);
  });

  let headerHeight = $state(40);

  function openTabInWorkspace(sessionId: string): void {
    workspace.activateTab(sessionId);
    const tabIndex = get(workspace).tabs.findIndex((tab) => tab.sessionId === sessionId);
    if (tabIndex >= 0) {
      requestedWorkspacePage.set(tabIndex);
    }
    currentView = 'workspace';
  }

  async function activateRequestedSession(sessionId: string): Promise<void> {
    const existingTab = get(workspace).tabs.find((candidate) => candidate.sessionId === sessionId);

    if (!existingTab) {
      try {
        const session = await getSession(sessionId);
        if (!session) {
          return;
        }

        workspace.openTab({
          sessionId: session.id,
          title: session.cwd.split('/').pop() || session.id.slice(0, 8),
          cwd: session.cwd,
          status: session.status,
          attention: 'none',
          backend: session.backend,
          sshConnectionId: session.sshConnectionId,
        });
      } catch (error) {
        console.error('[notifications] Failed to open requested session', error);
        return;
      }
    }

    openTabInWorkspace(sessionId);
  }

  $effect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const messageHandler = (event: MessageEvent<unknown>) => {
      const payload = event.data;
      if (!isActivateSessionPayload(payload)) {
        return;
      }

      dispatchSessionActivation(payload.sessionId);
    };

    const activationHandler = (event: Event) => {
      const customEvent = event as CustomEvent<{ sessionId?: string }>;
      const sessionId = customEvent.detail?.sessionId;
      if (typeof sessionId !== 'string') {
        return;
      }

      void activateRequestedSession(sessionId);
    };

    window.addEventListener(ACTIVATE_SESSION_EVENT, activationHandler);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', messageHandler);
    }

    const pendingSessionId = consumeRequestedSessionActivation();
    if (pendingSessionId) {
      dispatchSessionActivation(pendingSessionId);
    }

    setupNotificationAudioUnlock();

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', messageHandler);
      }
      window.removeEventListener(ACTIVATE_SESSION_EVENT, activationHandler);
    };
  });
</script>

<a href="#main-content" class="skip-link">Skip to content</a>

<div class="app-shell">
  <header class="app-header" class:workspace-mode={currentView === 'workspace'} bind:clientHeight={headerHeight}>
    {#if $workspace.tabs.length > 0}
      <SessionTabs ongoHome={goHome} ongoWorkspace={goWorkspace} {currentView} />
    {/if}

    <!-- "+" new-session button moved into SessionTabs strip (concept §2.3).
         header-actions retained empty for future toolbar content. -->
    <div class="header-actions"></div>
  </header>
  
  <main id="main-content" tabindex="-1" class="app-content" data-view={currentView}>
    {#if currentView === 'home' || $workspace.tabs.length === 0}
      <SessionList onopenSession={(e) => {
        workspace.openTab(e);
        openTabInWorkspace(e.sessionId);
      }} />
    {:else}
      <WorkspaceView {headerHeight} />
    {/if}
  </main>

  <ToastProvider />
</div>

<style>
  .skip-link {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
    z-index: var(--z-toast);
    background: var(--bg-elevated);
    color: var(--text-primary);
    border: 1px solid var(--border-accent);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    font-family: var(--font-ui);
    font-size: var(--font-size-sm);
    text-decoration: none;
  }

  .skip-link:focus-visible {
    position: fixed;
    top: var(--space-2);
    left: var(--space-2);
    width: auto;
    height: auto;
    margin: 0;
    overflow: visible;
    clip: auto;
    white-space: normal;
  }

  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    box-sizing: border-box;
    background: var(--bg-base);
    color: var(--text-primary);
    font-family: var(--font-mono);
    overflow: hidden;
  }
  
  .app-header {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 0 var(--space-3);
    padding-left: 0;
    padding-right: 0;
    height: 40px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-default);
    flex-shrink: 0;
    overflow: visible;
  }

  .app-header.workspace-mode {
    padding-left: 0;
  }

  .header-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
    padding: 0 var(--space-2);
    border-left: 1px solid var(--border-subtle);
    align-self: stretch;
  }

  .header-actions:empty {
    display: none;
  }

  .app-content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  
  .app-content[data-view="home"] {
    overflow-y: auto;
    overflow-x: hidden;
  }
  
  .app-content[data-view="workspace"] {
    overflow: hidden;
  }
</style>
