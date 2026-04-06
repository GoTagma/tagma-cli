# @tagma/cli

A command-line tool for running **Tagma** Track & Task pipelines from YAML configuration files. Powered by [`@tagma/sdk`](https://github.com/GoTagma/tagma-sdk).

## Installation

> **Requires [Bun](https://bun.sh) v1.0 or later** — this CLI uses Bun-specific APIs and cannot run on Node.js.

```bash
bun add -g @tagma/cli
```

Or run without installing:

```bash
bunx @tagma/cli <pipeline.yaml>
```

## Quick Start

```bash
tagma ./pipeline.yaml
```

This loads the YAML pipeline definition, resolves plugins, and starts execution in the current directory.

## Options

| Flag | Description | Default |
| --- | --- | --- |
| `--cwd <dir>` | Working directory for pipeline execution | Current directory |
| `--ws-port <port>` | Port for the approval WebSocket server | `3000` |
| `-h`, `--help` | Show usage information | — |

The WebSocket port can also be configured via the `TAGMA_WS_PORT` environment variable.

## Examples

```bash
# Run a deployment pipeline
tagma ./pipelines/deploy.yaml

# Specify a custom working directory
tagma ./pipelines/build.yaml --cwd /path/to/project

# Use a custom WebSocket port for approval integration
tagma ./pipelines/release.yaml --ws-port 8080
```

## Approval Gateway

Pipeline steps that require human approval are gated by a dual-channel approval system. Both channels are active simultaneously — the first response wins:

- **Terminal (stdin)** — approve or reject interactively in your terminal session.
- **WebSocket** (`ws://localhost:<port>`) — connect from a dashboard, Slack bot, CI system, or any external automation.

## Plugins

Tagma pipelines can reference third-party plugins. Any plugins declared in your YAML configuration are automatically discovered and loaded at startup. See the [`@tagma/sdk` documentation](https://github.com/GoTagma/tagma-sdk) for details on writing and publishing plugins.

## Requirements

- [Bun](https://bun.sh) v1.0 or later

## License

See [LICENSE](./LICENSE) for details.
