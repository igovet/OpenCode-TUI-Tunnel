import { Command } from 'commander';

import { getLiveProcessState, getRuntimePaths } from '../../runtime/process-state.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show tunnel service status')
    .action(() => {
      const live = getLiveProcessState({ cleanupStale: true });

      if (!live) {
        console.log('Server status: stopped (PID file not found)');
        return;
      }

      if (live.url) {
        console.log(`Server status: running (PID: ${live.pid}, URL: ${live.url})`);
        return;
      }

      const { pidFilePath } = getRuntimePaths();
      console.log(`Server status: running (PID file: ${pidFilePath}, PID: ${live.pid})`);
    });
}
