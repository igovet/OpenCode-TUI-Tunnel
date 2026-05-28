import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { getConfigDir } from '../config/index.js';
import type { SshConnectionRecord } from '../db/index.js';

const execFileAsync = promisify(execFile);

function expandHomePath(inputPath: string): string {
  if (inputPath === '~') {
    return homedir();
  }

  if (inputPath.startsWith('~/')) {
    return join(homedir(), inputPath.slice(2));
  }

  return inputPath;
}

/**
 * Check if sshfs is available in PATH.
 */
export async function checkSshfsAvailable(): Promise<{ available: boolean; path?: string }> {
  try {
    const { stdout } = await execFileAsync('which', ['sshfs']);
    const path = stdout.trim();
    if (path.length > 0) {
      return { available: true, path };
    }
    return { available: false };
  } catch {
    return { available: false };
  }
}

/**
 * Get the local mount point for a given SSH connection and remote cwd.
 * Returns: ~/.config/opencode-tui-tunnel/mounts/{connectionName}/{sanitizedRemotePath}
 */
export function getMountPoint(connectionName: string, remoteCwd: string): string {
  const sanitizedPath = remoteCwd.replace(/[^a-zA-Z0-9_.-]/g, '_');
  return join(getConfigDir(), 'mounts', connectionName, sanitizedPath);
}

/**
 * Check if a mount point is currently active by querying the mount table.
 */
export async function isMountActive(mountPath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('mount', []);
    return stdout.includes(mountPath);
  } catch {
    return false;
  }
}

/**
 * Get the mount base directory path.
 */
export function getMountBaseDir(): string {
  return join(getConfigDir(), 'mounts');
}

/**
 * Ensure the mount base directory exists.
 */
function ensureMountBaseDir(): void {
  const baseDir = getMountBaseDir();
  if (!existsSync(baseDir)) {
    mkdirSync(baseDir, { recursive: true });
  }
}

/**
 * Check if a mount point is active and return the current remote path.
 * Returns the remote path (e.g., "user@host:/path") if mounted, or null if not mounted.
 */
async function getActiveRemotePath(mountPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('mount', []);
    // Parse mount output to find the line containing our mount path
    const lines = stdout.split('\n');
    for (const line of lines) {
      // mount output format: "user@host:/path on /local/path type fuse.sshfs (...)"
      if (line.includes(mountPath)) {
        // Extract remote path from "user@host:/path on /local/path"
        const match = line.match(/^([^\s]+)\s+on\s+/);
        if (match) {
          return match[1]; // e.g., "user@host:/remote/path"
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Mount a remote directory via SSHFS.
 * Returns the local mount path.
 *
 * Conflict handling: If mount point is already active, checks if it's the same
 * remote path. Same path = reuse. Different path = unmount stale first, then mount.
 */
export async function mountRemoteDirectory(
  record: SshConnectionRecord,
  remoteCwd: string,
): Promise<string> {
  const mountPath = getMountPoint(record.name, remoteCwd);

  // Create mount point directory
  mkdirSync(mountPath, { recursive: true });

  // If already mounted to this path, check if it's the same remote path
  if (await isMountActive(mountPath)) {
    const expectedRemotePath = `${record.username}@${record.host}:${remoteCwd}`;
    const currentRemotePath = await getActiveRemotePath(mountPath);

    // If same remote path is mounted, reuse it
    if (currentRemotePath === expectedRemotePath) {
      return mountPath;
    }

    // Different remote path mounted — unmount stale first
    await unmountRemoteDirectory(mountPath);
  }

  const sshfsArgs: string[] = [];

  // Port override
  if (record.port !== 22) {
    sshfsArgs.push('-p', String(record.port));
  }

  // Reconnect and keepalive options for resilience
  sshfsArgs.push('-o', 'reconnect,ServerAliveInterval=15');

  // Identity file for key auth
  if (record.auth_type === 'key' && record.private_key_path) {
    sshfsArgs.push('-o', `IdentityFile=${expandHomePath(record.private_key_path)}`);
  }

  const remotePath = `${record.username}@${record.host}:${remoteCwd}`;

  try {
    await execFileAsync('sshfs', [...sshfsArgs, remotePath, mountPath]);
    return mountPath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`SSHFS mount failed: ${message}`, { cause: error });
  }
}

/**
 * Unmount a previously mounted SSHFS directory.
 * Uses fusermount -u on Linux, umount on macOS.
 * Best-effort: does not throw if already unmounted.
 */
export async function unmountRemoteDirectory(mountPath: string): Promise<void> {
  const isLinux = process.platform === 'linux';
  const unmountCommand = isLinux ? 'fusermount' : 'umount';
  const unmountArgs = isLinux ? ['-u', mountPath] : [mountPath];

  try {
    await execFileAsync(unmountCommand, unmountArgs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Ignore "not mounted" or "not found" errors — mount may already be gone
    if (
      !message.includes('not mounted') &&
      !message.includes('not found') &&
      !message.includes('No such file') &&
      !message.includes('Invalid argument')
    ) {
      throw new Error(`SSHFS unmount failed: ${message}`, { cause: error });
    }
  }
}

/**
 * Scan mount base directory and unmount all stale mounts.
 * A stale mount is a mount point that exists on disk but is not actively mounted.
 * Logs each cleanup action via console.log for traceability.
 */
export async function cleanupStaleMounts(
  onLog?: (event: string, data: object) => void,
): Promise<number> {
  ensureMountBaseDir();
  const baseDir = getMountBaseDir();

  if (!existsSync(baseDir)) {
    return 0;
  }

  let cleanedCount = 0;

  // Scan all connection directories
  let connectionDirs: string[];
  try {
    connectionDirs = readdirSync(baseDir);
  } catch {
    return 0;
  }

  for (const connName of connectionDirs) {
    const connPath = join(baseDir, connName);
    try {
      if (!statSync(connPath).isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }

    // Scan all mount point directories for this connection
    let mountDirs: string[];
    try {
      mountDirs = readdirSync(connPath);
    } catch {
      continue;
    }

    for (const mountDir of mountDirs) {
      const mountPath = join(connPath, mountDir);

      try {
        if (!statSync(mountPath).isDirectory()) {
          continue;
        }
      } catch {
        continue;
      }

      // Check if this mount point is active
      const active = await isMountActive(mountPath);
      if (!active) {
        // Stale mount point — directory exists but not mounted
        // Try to unmount anyway (in case it's a ghost mount), then remove dir
        try {
          await unmountRemoteDirectory(mountPath);
        } catch {
          // best-effort: continue with directory cleanup
        }

        try {
          // Only remove the directory if empty (should be empty for stale mounts)
          const { rmdirSync } = await import('node:fs');
          rmdirSync(mountPath);
        } catch {
          // best-effort: directory may not be empty or already gone
        }

        cleanedCount++;
        const logMsg = `Cleaned stale mount: ${mountPath}`;
        console.log(logMsg);
        onLog?.('sshfs_stale_mount_cleaned', { mountPath, connectionName: connName });
      }
    }

    // Clean up empty connection directories
    try {
      const remainingMounts = readdirSync(connPath);
      if (remainingMounts.length === 0) {
        const { rmdirSync } = await import('node:fs');
        rmdirSync(connPath);
      }
    } catch {
      // best-effort
    }
  }

  return cleanedCount;
}

/**
 * Unmount all active SSHFS mount points.
 * Used during server shutdown to clean up all active mounts.
 * Returns the number of mounts successfully unmounted.
 */
export async function cleanupAllMounts(
  onLog?: (event: string, data: object) => void,
): Promise<number> {
  ensureMountBaseDir();
  const baseDir = getMountBaseDir();

  if (!existsSync(baseDir)) {
    return 0;
  }

  let unmountedCount = 0;

  // Scan all connection directories
  let connectionDirs: string[];
  try {
    connectionDirs = readdirSync(baseDir);
  } catch {
    return 0;
  }

  for (const connName of connectionDirs) {
    const connPath = join(baseDir, connName);
    try {
      if (!statSync(connPath).isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }

    // Scan all mount point directories for this connection
    let mountDirs: string[];
    try {
      mountDirs = readdirSync(connPath);
    } catch {
      continue;
    }

    for (const mountDir of mountDirs) {
      const mountPath = join(connPath, mountDir);

      try {
        if (!statSync(mountPath).isDirectory()) {
          continue;
        }
      } catch {
        continue;
      }

      // Check if this mount point is active
      const active = await isMountActive(mountPath);
      if (active) {
        try {
          await unmountRemoteDirectory(mountPath);
          unmountedCount++;
          const logMsg = `Unmounted active mount: ${mountPath}`;
          console.log(logMsg);
          onLog?.('sshfs_mount_unmounted', { mountPath, connectionName: connName });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.warn(`Failed to unmount ${mountPath}: ${msg}`);
          onLog?.('sshfs_mount_unmount_failed', { mountPath, connectionName: connName, error: msg });
        }
      }
    }
  }

  return unmountedCount;
}
