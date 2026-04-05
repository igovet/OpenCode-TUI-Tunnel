<script lang="ts">
  import { workspace } from '../lib/workspace';
  import TerminalGrid from '../components/TerminalGrid.svelte';
  import MobileKeybar from '../components/MobileKeybar.svelte';
  import { activeTerminalWrite } from '../lib/activeTerminal';
  
  // Reactive active tab
  let activeTab = $derived($workspace.tabs.find(t => t.sessionId === $workspace.activeTabId));
</script>

<div class="workspace">
  <div class="workspace-terminals">
    <TerminalGrid />
  </div>
  <MobileKeybar write={(k) => $activeTerminalWrite?.(k)} />
</div>

<style>
  .workspace {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
  .workspace-terminals {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
