# @tagma/cli

A command-line tool for running **Tagma** Track & Task pipelines from YAML configuration files. Powered by [`@tagma/sdk`](https://github.com/GoTagma/tagma-mono/tree/main/packages/sdk).

## Quick Start

```bash
bunx @tagma/cli ./pipeline.yaml
```

This loads the YAML pipeline definition, resolves plugins, and starts execution in the current directory.

If you installed globally via `bun add -g @tagma/cli`, you can use the short form:

```bash
tagma ./pipeline.yaml
```

## Commands

| Command | Description |
| --- | --- |
| `tagma <pipeline.yaml>` | Shorthand for `tagma run`. |
| `tagma run <pipeline.yaml>` | Execute the pipeline. |
| `tagma validate <pipeline.yaml>` | Validate without running (raw + resolved checks). |
| `tagma compile <pipeline.yaml>` | Parse and validate, print a structured report. |
| `tagma dag <pipeline.yaml>` | Print the task DAG in topological order. |

## Options

| Flag | Description | Applies to | Default |
| --- | --- | --- | --- |
| `--cwd <dir>` | Working directory for pipeline execution | all | Current directory |
| `--ws-port <port>` | Port for the approval WebSocket server | `run` | `3000` |
| `--json` | Emit JSON output | `validate`, `compile`, `dag` | none |
| `-h`, `--help` | Show usage information | all | none |
| `-v`, `--version` | Show CLI version | all | none |

The WebSocket port can also be configured via the `TAGMA_WS_PORT` environment variable.

## Examples

```bash
# Run a deployment pipeline
bunx @tagma/cli ./pipelines/deploy.yaml

# Specify a custom working directory
bunx @tagma/cli ./pipelines/build.yaml --cwd /path/to/project

# Use a custom WebSocket port for approval integration
bunx @tagma/cli run ./pipelines/release.yaml --ws-port 8080

# Validate a pipeline before committing
tagma validate ./pipelines/deploy.yaml

# Inspect the task DAG (machine-readable)
tagma dag ./pipelines/deploy.yaml --json

# Compile and get a structured report
tagma compile ./pipelines/deploy.yaml --json
```

## Approval Gateway

Pipeline steps that require human approval are gated by a dual-channel approval system. Both channels are active simultaneously; the first response wins:

- **Terminal (stdin)**: approve or reject interactively in your terminal session.
- **WebSocket** (`ws://localhost:<port>`): connect from a dashboard, Slack bot, CI system, or any external automation.

## Plugins

Tagma pipelines can reference third-party plugins. Any plugins declared in your YAML configuration are automatically discovered and loaded at startup. See the [`@tagma/sdk` documentation](https://github.com/GoTagma/tagma-mono/tree/main/packages/sdk) for details on writing and publishing plugins.

## Requirements

- [Bun](https://bun.sh) v1.3 or later

## License

See [LICENSE](./LICENSE) for details.
