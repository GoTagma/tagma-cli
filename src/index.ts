#!/usr/bin/env bun

import { basename, resolve } from 'path';
import { createTagma } from '@tagma/sdk';
import { InMemoryApprovalGateway } from '@tagma/sdk/approval';
import { buildDag } from '@tagma/sdk/config';
import { compileYamlContent, loadPipeline } from '@tagma/sdk/yaml';
import { attachStdinApprovalAdapter } from '@tagma/runtime-bun/adapters/stdin-approval';
import { attachWebSocketApprovalAdapter } from '@tagma/runtime-bun/adapters/websocket-approval';
import pkg from '../package.json' with { type: 'json' };
import type { PipelineConfig } from '@tagma/sdk';
import type { Dag } from '@tagma/sdk/config';

type Command = 'run' | 'validate' | 'compile' | 'dag';
const COMMANDS = new Set<Command>(['run', 'validate', 'compile', 'dag']);
type PipelineTask = PipelineConfig['tracks'][number]['tasks'][number];

interface ParsedArgs {
  command: Command;
  file: string | undefined;
  cwd: string;
  wsPort: number;
  json: boolean;
  help: boolean;
  version: boolean;
}

function printHelp(): void {
  console.log(`tagma - Track & Task pipeline runner

Usage:
  tagma <pipeline.yaml> [options]              # shorthand for "tagma run"
  tagma run <pipeline.yaml> [options]          # execute a pipeline
  tagma validate <pipeline.yaml> [options]     # validate without running
  tagma compile <pipeline.yaml> [options]      # parse + validate, print report
  tagma dag <pipeline.yaml> [options]          # print task DAG (topological order)

Options:
  --cwd <dir>          Working directory for pipeline execution (default: cwd)
  --ws-port <port>     Approval WebSocket port for "run" (default: 3000, env TAGMA_WS_PORT)
  --json               Emit JSON output (validate / compile / dag)
  -h, --help           Show this help
  -v, --version        Show CLI version`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    command: 'run',
    file: undefined,
    cwd: process.cwd(),
    wsPort: parseWsPortDefault(),
    json: false,
    help: false,
    version: false,
  };

  if (argv.length === 0) {
    out.help = true;
    return out;
  }

  let i = 0;
  const first = argv[0];
  if (COMMANDS.has(first as Command)) {
    out.command = first as Command;
    i = 1;
  }

  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      out.help = true;
    } else if (a === '-v' || a === '--version') {
      out.version = true;
    } else if (a === '--cwd') {
      const v = argv[++i];
      if (!v) throw new Error('--cwd requires a value');
      out.cwd = resolve(v);
    } else if (a === '--ws-port') {
      const v = argv[++i];
      if (!v) throw new Error('--ws-port requires a value');
      const n = parseInt(v, 10);
      if (isNaN(n)) throw new Error(`--ws-port must be a number, got "${v}"`);
      out.wsPort = n;
    } else if (a === '--json') {
      out.json = true;
    } else if (a.startsWith('-')) {
      throw new Error(`Unknown flag: ${a}`);
    } else if (out.file === undefined) {
      out.file = resolve(a);
    } else {
      throw new Error(`Unexpected positional argument: ${a}`);
    }
  }

  return out;
}

function parseWsPortDefault(): number {
  const env = process.env['TAGMA_WS_PORT'];
  if (env) {
    const n = parseInt(env, 10);
    if (!isNaN(n)) return n;
  }
  return 3000;
}

function taskType(task: PipelineTask): 'command' | 'prompt' {
  return task.command !== undefined && task.prompt === undefined ? 'command' : 'prompt';
}

async function readYamlOrExit(path: string | undefined): Promise<{ content: string; path: string }> {
  if (!path) {
    console.error('Missing pipeline YAML file. See `tagma --help`.');
    process.exit(2);
  }
  const file = Bun.file(path);
  if (!(await file.exists())) {
    console.error(`File not found: ${path}`);
    process.exit(1);
  }
  return { content: await file.text(), path };
}

async function cmdRun(args: ParsedArgs): Promise<number> {
  const { content } = await readYamlOrExit(args.file);

  let config: PipelineConfig;
  try {
    config = await loadPipeline(content, args.cwd);
  } catch (err: unknown) {
    console.error(`Configuration error: ${errMsg(err)}`);
    return 1;
  }

  const approvalGateway = new InMemoryApprovalGateway();
  const stdinAdapter = attachStdinApprovalAdapter(approvalGateway);
  const wsAdapter = attachWebSocketApprovalAdapter(approvalGateway, { port: args.wsPort });
  console.log(`Approval WebSocket listening on ws://localhost:${wsAdapter.port}`);

  console.log(`Starting pipeline: "${config.name}"`);
  try {
    const tagma = createTagma();
    const result = await tagma.run(config, { cwd: args.cwd, approvalGateway });
    return result.success ? 0 : 1;
  } finally {
    stdinAdapter.detach();
    wsAdapter.detach();
  }
}

async function cmdCompile(args: ParsedArgs): Promise<number> {
  const { content, path } = await readYamlOrExit(args.file);
  const result = compileYamlContent(content, { sourceName: basename(path) });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.summary);
    if (result.validation.errors.length > 0) {
      console.log('\nErrors:');
      for (const e of result.validation.errors) console.log(`  ${e.path}: ${e.message}`);
    }
    if (result.validation.warnings.length > 0) {
      console.log('\nWarnings:');
      for (const w of result.validation.warnings) console.log(`  ${w.path}: ${w.message}`);
    }
  }
  return result.success ? 0 : 1;
}

async function cmdValidate(args: ParsedArgs): Promise<number> {
  const { content, path } = await readYamlOrExit(args.file);

  const compile = compileYamlContent(content, { sourceName: basename(path) });
  if (!compile.success) {
    if (args.json) {
      console.log(JSON.stringify({ ok: false, stage: 'raw', ...compile }, null, 2));
    } else {
      console.error(compile.summary);
      for (const e of compile.validation.errors) console.error(`  ${e.path}: ${e.message}`);
    }
    return 1;
  }

  try {
    await loadPipeline(content, args.cwd);
  } catch (err: unknown) {
    if (args.json) {
      console.log(JSON.stringify({ ok: false, stage: 'resolved', error: errMsg(err) }, null, 2));
    } else {
      console.error(`Resolved validation failed: ${errMsg(err)}`);
    }
    return 1;
  }

  if (args.json) {
    console.log(JSON.stringify({ ok: true, ...compile }, null, 2));
  } else {
    console.log(`OK: ${compile.summary}`);
  }
  return 0;
}

async function cmdDag(args: ParsedArgs): Promise<number> {
  const { content } = await readYamlOrExit(args.file);

  let config: PipelineConfig;
  try {
    config = await loadPipeline(content, args.cwd);
  } catch (err: unknown) {
    console.error(`Configuration error: ${errMsg(err)}`);
    return 1;
  }

  let dag: Dag;
  try {
    dag = buildDag(config);
  } catch (err: unknown) {
    console.error(`DAG build error: ${errMsg(err)}`);
    return 1;
  }

  if (args.json) {
    const nodes = dag.sorted.map((id) => {
      const n = dag.nodes.get(id)!;
      return {
        taskId: n.taskId,
        track: n.track.id,
        type: taskType(n.task),
        dependsOn: n.dependsOn,
        ...(n.resolvedContinueFrom ? { continueFrom: n.resolvedContinueFrom } : {}),
      };
    });
    console.log(JSON.stringify({ pipeline: config.name, nodes }, null, 2));
  } else {
    console.log(`Pipeline: ${config.name}`);
    console.log('Tasks (topological order):');
    for (const id of dag.sorted) {
      const n = dag.nodes.get(id)!;
      const deps = n.dependsOn.length > 0 ? `  [deps: ${n.dependsOn.join(', ')}]` : '';
      const cont = n.resolvedContinueFrom ? `  [continue_from: ${n.resolvedContinueFrom}]` : '';
      console.log(`  ${id}  (${taskType(n.task)})${deps}${cont}`);
    }
  }
  return 0;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function main(): Promise<void> {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(errMsg(err));
    console.error('See `tagma --help`.');
    process.exit(2);
  }

  if (args.version) {
    console.log(pkg.version);
    process.exit(0);
  }
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  let code: number;
  switch (args.command) {
    case 'run':
      code = await cmdRun(args);
      break;
    case 'validate':
      code = await cmdValidate(args);
      break;
    case 'compile':
      code = await cmdCompile(args);
      break;
    case 'dag':
      code = await cmdDag(args);
      break;
  }
  process.exit(code);
}

main().catch((err) => {
  console.error(`Fatal error: ${errMsg(err)}`);
  process.exit(1);
});
