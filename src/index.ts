#!/usr/bin/env bun

import { resolve } from 'path';
import {
  bootstrapBuiltins,
  loadPipeline,
  loadPlugins,
  runPipeline,
  InMemoryApprovalGateway,
  attachStdinApprovalAdapter,
  attachWebSocketApprovalAdapter,
} from '@tagma/sdk';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: tagma <pipeline.yaml> [--cwd <dir>] [--ws-port <port>]`);
    console.log(`\nRun a Track & Task pipeline from a YAML configuration file.`);
    process.exit(0);
  }

  const yamlPath = resolve(args[0]);
  let workDir = process.cwd();

  const cwdIdx = args.indexOf('--cwd');
  if (cwdIdx !== -1 && args[cwdIdx + 1]) {
    workDir = resolve(args[cwdIdx + 1]);
  }

  // 1. Bootstrap built-in plugins
  bootstrapBuiltins();

  // 2. Load and parse YAML
  const file = Bun.file(yamlPath);
  if (!(await file.exists())) {
    console.error(`File not found: ${yamlPath}`);
    process.exit(1);
  }

  const yamlContent = await file.text();
  let config;
  try {
    config = await loadPipeline(yamlContent, workDir);
  } catch (err: unknown) {
    console.error(`Configuration error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // 3. Load third-party plugins
  if (config.plugins && config.plugins.length > 0) {
    try {
      await loadPlugins(config.plugins);
    } catch (err: unknown) {
      console.error(`Plugin load error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  }

  // 4. Wire approval gateway — attach both stdin and WebSocket adapters simultaneously.
  //    Whichever receives a decision first wins; the other's resolve() call returns false
  //    (already resolved) and is silently ignored.
  const approvalGateway = new InMemoryApprovalGateway();
  const stdinAdapter = attachStdinApprovalAdapter(approvalGateway);

  const wsPort = parseWsPort(args);
  const wsAdapter = attachWebSocketApprovalAdapter(approvalGateway, { port: wsPort });
  console.log(`Approval WebSocket listening on ws://localhost:${wsAdapter.port}`);

  // 5. Run the pipeline
  console.log(`Starting pipeline: "${config.name}"`);
  try {
    const result = await runPipeline(config, workDir, { approvalGateway });
    process.exit(result.success ? 0 : 1);
  } finally {
    stdinAdapter.detach();
    wsAdapter.detach();
  }
}

main().catch(err => {
  console.error(`Fatal error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});

function parseWsPort(args: string[]): number {
  const idx = args.indexOf('--ws-port');
  if (idx !== -1 && args[idx + 1]) {
    const n = parseInt(args[idx + 1], 10);
    if (!isNaN(n)) return n;
  }
  const env = process.env['TAGMA_WS_PORT'];
  if (env) {
    const n = parseInt(env, 10);
    if (!isNaN(n)) return n;
  }
  return 3000;
}
