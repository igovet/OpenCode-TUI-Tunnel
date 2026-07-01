<script lang="ts">
  import Card from './ui/Card.svelte'
  import Button from './ui/Button.svelte'
  import Icon from './ui/Icon.svelte'
  import Badge from './ui/Badge.svelte'
  import StatusDot from './ui/StatusDot.svelte'

  interface RecentProject {
    cwd: string
    backend: 'local' | 'ssh'
    lastUsedAt: string
    sshConnectionName?: string
  }

  interface Props {
    project: RecentProject
    hasActiveSession: boolean
    onResume: (project: RecentProject) => void
    onDelete: (project: RecentProject) => void
  }

  const { project, hasActiveSession, onResume, onDelete }: Props = $props()

  function relativeTime(dateStr: string): string {
    const ms = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(ms / 60000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  const backendLabel = $derived(project.backend === 'ssh' ? 'SSH' : 'local')
  const folderColor = $derived(
    project.backend === 'ssh' ? 'var(--accent-cyan)' : 'var(--accent-green)'
  )

  function handleResume() {
    onResume(project)
  }

  function handleDelete(e: MouseEvent) {
    e.stopPropagation()
    onDelete(project)
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onResume(project)
    }
  }
</script>

<Card
  variant="glass"
  padding="lg"
  interactive
  role="button"
  tabindex="0"
  aria-label="Resume {project.cwd}"
  onclick={handleResume}
  onkeydown={handleKeydown}
>
  {#snippet children()}
    <div class="remove-btn-wrapper">
      <Button
        variant="ghost"
        icon
        size="sm"
        aria-label="Remove from recent"
        onclick={handleDelete}
      >
        <Icon name="close" size={14} />
      </Button>
    </div>

    <div class="folder-icon" style="color: {folderColor}">
      <Icon name="folder" size={24} />
    </div>

    <div class="project-path" title={project.cwd}>
      {project.cwd}
    </div>

    <div class="meta-line">
      <Badge variant="default">{backendLabel}</Badge>
      <span class="time-ago">{relativeTime(project.lastUsedAt)}</span>
    </div>

    <div class="status-line">
      {#if hasActiveSession}
        <StatusDot status="running" size="sm" />
        <span class="running-text">Running</span>
      {:else}
        <span class="ready-text">Ready to resume</span>
      {/if}
    </div>

    <Button
      variant={hasActiveSession ? 'primary' : 'secondary'}
      class="resume-btn"
      onclick={(e: MouseEvent) => {
        e.stopPropagation()
        handleResume()
      }}
    >
      <Icon name="power" size={16} />
      Resume
    </Button>
  {/snippet}
</Card>

<style>
  .remove-btn-wrapper {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
    z-index: var(--z-base);
  }

  .folder-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--space-3);
  }

  .project-path {
    font-size: var(--font-size-md);
    color: var(--text-primary);
    font-weight: var(--font-weight-semibold);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: var(--space-2);
  }

  .meta-line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .time-ago {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .status-line {
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    margin-bottom: var(--space-4);
  }

  .running-text {
    font-size: var(--font-size-sm);
    color: var(--accent-green);
    font-weight: var(--font-weight-medium);
  }

  .ready-text {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
  }

  .resume-btn {
    width: 100%;
  }
</style>
