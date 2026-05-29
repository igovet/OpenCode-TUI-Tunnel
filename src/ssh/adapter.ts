import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Client, type ClientChannel, type ConnectConfig } from 'ssh2';

import type { AppConfig } from '../config/index.js';
import type { SshConnectionRecord } from '../db/index.js';
import type { TmuxPtyHandle } from '../tmux/adapter.js';
import { decryptPassphrase, isPassphraseEncrypted } from '../crypto/index.js';

function expandHomePath(inputPath: string): string {
  if (inputPath === '~') {
    return homedir();
  }

  if (inputPath.startsWith('~/')) {
    return join(homedir(), inputPath.slice(2));
  }

  return inputPath;
}

class SshPtyHandle implements TmuxPtyHandle {
  private readonly client: Client;
  private channel: ClientChannel | null;
  private readonly dataCallbacks: Array<(data: Buffer) => void> = [];
  private closed = false;

  public constructor(client: Client, channel: ClientChannel) {
    this.client = client;
    this.channel = channel;

    channel.on('data', (data: Buffer | string) => {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
      for (const cb of this.dataCallbacks) {
        cb(buffer);
      }
    });

    channel.on('close', () => {
      this.close();
    });

    client.on('error', () => {
      this.close();
    });

    client.on('end', () => {
      this.close();
    });
  }

  public onData(cb: (data: Buffer) => void): void {
    this.dataCallbacks.push(cb);
  }

  public write(data: string): void {
    if (!this.channel || this.closed) {
      return;
    }
    this.channel.write(data);
  }

  public resize(cols: number, rows: number): void {
    if (!this.channel || this.closed) {
      return;
    }
    this.channel.setWindow(rows, cols, 0, 0);
  }

  public pause(): void {
    if (!this.channel || this.closed) {
      return;
    }
    this.channel.pause();
  }

  public resume(): void {
    if (!this.channel || this.closed) {
      return;
    }
    this.channel.resume();
  }

  public close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;

    try {
      this.channel?.end();
    } catch {
      // best-effort
    }
    this.channel = null;

    try {
      this.client.end();
    } catch {
      // best-effort
    }
  }
}

function buildSshConnectConfig(
  record: SshConnectionRecord,
  config: AppConfig,
): ConnectConfig {
  const connectConfig: ConnectConfig = {
    host: record.host,
    port: record.port,
    username: record.username,
    readyTimeout: config.ssh.connectionTimeoutMs,
    keepaliveInterval: config.ssh.keepAliveIntervalMs,
  };

  if (config.ssh.agentForwarding) {
    connectConfig.agentForward = true;
  }

  if (record.auth_type === 'agent') {
    const agentSock = process.env.SSH_AUTH_SOCK;
    if (agentSock) {
      connectConfig.agent = agentSock;
    }
  } else if (record.auth_type === 'key') {
    const keyPath = record.private_key_path ?? config.ssh.defaultKeyPath;
    if (keyPath) {
      try {
        connectConfig.privateKey = readFileSync(expandHomePath(keyPath));
      } catch (error) {
        throw new Error(
          `Failed to read private key at ${keyPath}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    }
    if (record.passphrase_encrypted) {
      // Decrypt the passphrase if it's stored in encrypted format
      // If decryption fails (e.g., pre-migration plaintext), use as-is for backward compatibility
      if (isPassphraseEncrypted(record.passphrase_encrypted)) {
        try {
          connectConfig.passphrase = decryptPassphrase(record.passphrase_encrypted);
        } catch {
          // Migration fallback: passphrase might be plaintext (pre-migration)
          // Use as-is to maintain backward compatibility
          connectConfig.passphrase = record.passphrase_encrypted;
        }
      } else {
        // Pre-migration: stored as plaintext, use directly
        connectConfig.passphrase = record.passphrase_encrypted;
      }
    }
  }

  return connectConfig;
}

export async function connectSshClient(
  record: SshConnectionRecord,
  config: AppConfig,
): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const connectConfig = buildSshConnectConfig(record, config);

    client.once('ready', () => {
      resolve(client);
    });

    client.once('error', (error) => {
      reject(new Error(`SSH connection failed: ${error.message}`));
    });

    client.connect(connectConfig);
  });
}

export async function testSshConnection(
  record: SshConnectionRecord,
  config: AppConfig,
): Promise<{ success: boolean; error?: string }> {
  let client: Client | null = null;

  try {
    client = await connectSshClient(record, config);

    const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      const onDone = () => {
        client!.removeListener('end', onDone);
        client!.removeListener('close', onDone);
      };

      client!.once('end', onDone);
      client!.once('close', onDone);

      client!.exec('echo "opencode-tui-tunnel-ssh-test"', (error, channel) => {
        if (error) {
          client!.removeListener('end', onDone);
          client!.removeListener('close', onDone);
          resolve({ success: false, error: error.message });
          return;
        }

        let output = '';
        channel.on('data', (data: Buffer | string) => {
          output += Buffer.isBuffer(data) ? data.toString('utf8') : data;
        });

        const cleanupAndResolve = (success: boolean, errorMsg?: string) => {
          client!.removeListener('end', onDone);
          client!.removeListener('close', onDone);
          resolve({ success, error: errorMsg });
        };

        channel.once('close', () => {
          if (output.includes('opencode-tui-tunnel-ssh-test')) {
            cleanupAndResolve(true);
          } else {
            cleanupAndResolve(false, 'Unexpected response from remote host');
          }
        });

        channel.once('exit', () => {
          if (output.includes('opencode-tui-tunnel-ssh-test')) {
            cleanupAndResolve(true);
          } else {
            cleanupAndResolve(false, 'Unexpected response from remote host');
          }
        });
      });
    });
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'SSH connection test failed',
    };
  } finally {
    try {
      client?.end();
    } catch {
      // best-effort cleanup
    }
  }
}

export async function createRemoteSession(
  record: SshConnectionRecord,
  config: AppConfig,
  tmuxName: string,
  cwd: string,
  tunnelUrl?: string,
): Promise<void> {
  const client = await connectSshClient(record, config);

  try {
    await new Promise<void>((resolve, reject) => {
      const onDone = () => {
        client.removeListener('end', onDone);
        client.removeListener('close', onDone);
        resolve();
      };

      client.once('end', onDone);
      client.once('close', onDone);

      const envArgs: string[] = [];
      if (tunnelUrl) {
        envArgs.push(`-e OPENCODE_TUI_TUNNEL_URL=${tunnelUrl}`);
      }
      const cmd = `tmux new-session -d -s ${tmuxName} -c ${cwd}${envArgs.length > 0 ? ` ${envArgs.join(' ')}` : ''}`;

      client.exec(cmd, (error, channel) => {
        if (error) {
          client.removeListener('end', onDone);
          client.removeListener('close', onDone);
          reject(new Error(`Failed to create remote tmux session: ${error.message}`));
          return;
        }

        let stderr = '';
        channel.stderr.on('data', (data: Buffer | string) => {
          stderr += Buffer.isBuffer(data) ? data.toString('utf8') : data;
        });

        const cleanupAndResolve = () => {
          client.removeListener('end', onDone);
          client.removeListener('close', onDone);
        };

        channel.once('close', (code: number | null) => {
          cleanupAndResolve();
          if (code !== 0 && code !== null) {
            reject(
              new Error(
                `Remote tmux new-session failed (exit ${code}): ${stderr || 'unknown error'}`,
              ),
            );
          } else {
            resolve();
          }
        });

        channel.once('exit', (code: number | null) => {
          cleanupAndResolve();
          if (code !== 0 && code !== null) {
            reject(
              new Error(
                `Remote tmux new-session failed (exit ${code}): ${stderr || 'unknown error'}`,
              ),
            );
          } else {
            resolve();
          }
        });
      });
    });

    await new Promise<void>((resolve, reject) => {
      const onDone = () => {
        client.removeListener('end', onDone);
        client.removeListener('close', onDone);
        resolve();
      };

      client.once('end', onDone);
      client.once('close', onDone);

      client.exec(`tmux set-option -t ${tmuxName} status off`, (error, channel) => {
        if (error) {
          client.removeListener('end', onDone);
          client.removeListener('close', onDone);
          reject(error);
          return;
        }

        channel.once('close', () => {
          client.removeListener('end', onDone);
          client.removeListener('close', onDone);
          resolve();
        });

        channel.once('exit', () => {
          client.removeListener('end', onDone);
          client.removeListener('close', onDone);
          resolve();
        });
      });
    });
  } finally {
    client.end();
  }
}

export async function sendRemoteCommand(
  record: SshConnectionRecord,
  config: AppConfig,
  tmuxName: string,
  command: string,
): Promise<void> {
  const client = await connectSshClient(record, config);

  try {
    await new Promise<void>((resolve, reject) => {
      const onDone = () => {
        client.removeListener('end', onDone);
        client.removeListener('close', onDone);
        resolve();
      };

      client.once('end', onDone);
      client.once('close', onDone);

      const escapedCommand = command.replaceAll("'", "'\\''");
      client.exec(
        `tmux send-keys -t ${tmuxName} '${escapedCommand}' Enter`,
        (error, channel) => {
          if (error) {
            client.removeListener('end', onDone);
            client.removeListener('close', onDone);
            reject(error);
            return;
          }

          channel.once('close', () => {
            client.removeListener('end', onDone);
            client.removeListener('close', onDone);
            resolve();
          });

          channel.once('exit', () => {
            client.removeListener('end', onDone);
            client.removeListener('close', onDone);
            resolve();
          });
        },
      );
    });
  } finally {
    client.end();
  }
}

export async function killRemoteSession(
  record: SshConnectionRecord,
  config: AppConfig,
  tmuxName: string,
): Promise<void> {
  const client = await connectSshClient(record, config);

  try {
    await new Promise<void>((resolve, reject) => {
      const onDone = () => {
        client.removeListener('end', onDone);
        client.removeListener('close', onDone);
        resolve();
      };

      client.once('end', onDone);
      client.once('close', onDone);

      client.exec(`tmux kill-session -t ${tmuxName}`, (error, channel) => {
        if (error) {
          client.removeListener('end', onDone);
          client.removeListener('close', onDone);
          reject(error);
          return;
        }

        channel.once('close', () => {
          client.removeListener('end', onDone);
          client.removeListener('close', onDone);
          resolve();
        });

        channel.once('exit', () => {
          client.removeListener('end', onDone);
          client.removeListener('close', onDone);
          resolve();
        });
      });
    });
  } finally {
    client.end();
  }
}

export async function listRemoteTunnelSessions(
  record: SshConnectionRecord,
  config: AppConfig,
  filterPrefix?: string | null,
): Promise<Array<{ name: string; created: string; windows: number; attached: number; id: string }>> {
  const client = await connectSshClient(record, config);

  try {
    const result = await new Promise<
      Array<{ name: string; created: string; windows: number; attached: number; id: string }>
    >((resolve, reject) => {
      const onDone = () => {
        client.removeListener('end', onDone);
        client.removeListener('close', onDone);
      };

      client.once('end', onDone);
      client.once('close', onDone);

      const tab = '\t';
      client.exec(
        `tmux list-sessions -F '#{session_name}${tab}#{session_created}${tab}#{session_windows}${tab}#{session_attached}${tab}#{session_id}'`,
        (error, channel) => {
          if (error) {
            client.removeListener('end', onDone);
            client.removeListener('close', onDone);
            reject(error);
            return;
          }

          let stdout = '';
          channel.on('data', (data: Buffer | string) => {
            stdout += Buffer.isBuffer(data) ? data.toString('utf8') : data;
          });

          const cleanupAndResolve = (sessions: Array<{ name: string; created: string; windows: number; attached: number; id: string }>) => {
            client.removeListener('end', onDone);
            client.removeListener('close', onDone);
            resolve(sessions);
          };

          channel.once('close', () => {
            const sessions = stdout
              .trim()
              .split('\n')
              .filter((line) => line.trim().length > 0)
              .map((line) => {
                const [name, created, windows, attached, id] = line.split('\t');
                return {
                  name,
                  created,
                  windows: Number.parseInt(windows, 10),
                  attached: Number.parseInt(attached, 10),
                  id,
                };
              })
              .filter((session) => {
                if (filterPrefix === null) return true;
                const prefix = filterPrefix ?? 'oct-';
                return session.name.startsWith(prefix);
              });

            cleanupAndResolve(sessions);
          });

          channel.once('exit', () => {
            const sessions = stdout
              .trim()
              .split('\n')
              .filter((line) => line.trim().length > 0)
              .map((line) => {
                const [name, created, windows, attached, id] = line.split('\t');
                return {
                  name,
                  created,
                  windows: Number.parseInt(windows, 10),
                  attached: Number.parseInt(attached, 10),
                  id,
                };
              })
              .filter((session) => {
                if (filterPrefix === null) return true;
                const prefix = filterPrefix ?? 'oct-';
                return session.name.startsWith(prefix);
              });

            cleanupAndResolve(sessions);
          });
        },
      );
    });
    return result;
  } finally {
    client.end();
  }
}

export function attachRemotePty(
  record: SshConnectionRecord,
  config: AppConfig,
  tmuxName: string,
  cols: number,
  rows: number,
): Promise<TmuxPtyHandle> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const connectConfig = buildSshConnectConfig(record, config);

    client.once('ready', () => {
      client.exec(
        `tmux attach-session -t "${tmuxName.replace(/"/g, '\\"')}"`,
        {
          pty: {
            cols,
            rows,
            term: 'xterm-256color',
          },
          env: {
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
            LANG: 'en_US.UTF-8',
            LC_ALL: 'en_US.UTF-8',
          },
        },
        (error, channel) => {
          if (error) {
            client.end();
            reject(new Error(`Failed to attach to remote tmux session: ${error.message}`));
            return;
          }

          const handle = new SshPtyHandle(client, channel);
          resolve(handle);
        },
      );
    });

    client.once('error', (error) => {
      reject(new Error(`SSH connection failed: ${error.message}`));
    });

    client.connect(connectConfig);
  });
}
