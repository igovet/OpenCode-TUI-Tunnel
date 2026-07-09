import { describe, it } from 'node:test';
import { match } from 'node:assert';
import { execSync } from 'node:child_process';

describe('CLI smoke test', () => {
  it('should print help without error', () => {
    const output = execSync('node dist/cli/bin.js --help', { encoding: 'utf-8' });
    match(output, /Usage/);
  });

  it('should print version without error', () => {
    const output = execSync('node dist/cli/bin.js --version', { encoding: 'utf-8' });
    match(output, /\d+\.\d+\.\d+/);
  });

  it('should run doctor without error', () => {
    const output = execSync('node dist/cli/bin.js doctor', { encoding: 'utf-8' });
    match(output, /Node\.js/);
  });
});
