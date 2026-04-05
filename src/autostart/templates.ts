import { isAbsolute } from 'node:path';

import type { ServiceSpec } from './index.js';

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid service spec: ${field} must be a non-empty string`);
  }
}

export function validateServiceSpec(spec: ServiceSpec): void {
  assertNonEmptyString(spec.label, 'label');
  assertNonEmptyString(spec.cliPath, 'cliPath');
  assertNonEmptyString(spec.workingDirectory, 'workingDirectory');

  if (!isAbsolute(spec.cliPath)) {
    throw new Error(`Invalid service spec: cliPath must be absolute (received: ${spec.cliPath})`);
  }

  if (!isAbsolute(spec.workingDirectory)) {
    throw new Error(
      `Invalid service spec: workingDirectory must be absolute (received: ${spec.workingDirectory})`,
    );
  }

  if (!Array.isArray(spec.startArgv) || spec.startArgv.some((token) => typeof token !== 'string')) {
    throw new Error('Invalid service spec: startArgv must be a string array');
  }

  const pathEnv = spec.environment.PATH;
  assertNonEmptyString(pathEnv, 'environment.PATH');

  if (spec.mode !== 'systemd' && spec.mode !== 'launchd') {
    throw new Error(
      `Invalid service spec: mode must be systemd or launchd (received: ${spec.mode})`,
    );
  }
}

function removeNoOpenTokens(startArgv: string[]): string[] {
  return startArgv.filter((token) => token !== '--no-open');
}

export function buildRunServerArgv(spec: ServiceSpec): string[] {
  validateServiceSpec(spec);

  return [
    spec.cliPath,
    'internal',
    'run-server',
    '--mode',
    spec.mode,
    '--no-open',
    ...removeNoOpenTokens(spec.startArgv),
  ];
}

function escapeSystemdExecToken(token: string): string {
  const escaped = token
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('$', '\\$')
    .replaceAll('%', '%%');

  return `"${escaped}"`;
}

function escapeSystemdEnvironmentValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%');
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function renderSystemdUserUnit(spec: ServiceSpec): string {
  const argv = buildRunServerArgv(spec);
  const execStart = argv.map(escapeSystemdExecToken).join(' ');
  const pathEnv = escapeSystemdEnvironmentValue(spec.environment.PATH);

  return [
    '[Unit]',
    'Description=OpenCode TUI Tunnel',
    '',
    '[Service]',
    'Type=simple',
    `ExecStart=${execStart}`,
    `Environment="PATH=${pathEnv}"`,
    'WorkingDirectory=%h',
    'Restart=on-failure',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}

export function renderLaunchdAgentPlist(spec: ServiceSpec): string {
  const argv = buildRunServerArgv(spec);
  const argumentLines = argv.map((token) => `    <string>${escapeXml(token)}</string>`).join('\n');
  const pathEnv = escapeXml(spec.environment.PATH);
  const label = escapeXml(spec.label);
  const workingDirectory = escapeXml(spec.workingDirectory);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    `  <string>${label}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    argumentLines,
    '  </array>',
    '  <key>RunAtLoad</key>',
    '  <true/>',
    '  <key>KeepAlive</key>',
    '  <true/>',
    '  <key>WorkingDirectory</key>',
    `  <string>${workingDirectory}</string>`,
    '  <key>EnvironmentVariables</key>',
    '  <dict>',
    '    <key>PATH</key>',
    `    <string>${pathEnv}</string>`,
    '  </dict>',
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}
