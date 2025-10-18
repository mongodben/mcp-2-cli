# mcp-2-cli

Convert any MCP (Model Context Protocol) server to a CLI application.

`mcp-2-cli` is a TypeScript library to create a CLI application for any MCP server. This is useful if you want to use an MCP server's tools, resources, and prompts outside an MCP client. The `mcp-2-cli` library acts as a MCP client with the CLI as the interface.

For example, you may want to use an MCP server's tools inside an [Agent Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview) or in a programmatic script.

## Features

- Automatically generates CLI commands from MCP server capabilities
- Supports MCP **prompts**, **resources**, and **tools**
- JSON Schema validation for tool arguments
- Graceful error handling with JSONRPC error support
- Built with TypeScript for type safety

## Installation

```bash
npm install mcp-2-cli
```

## Usage

### Basic Example

```typescript
import { createMcpCli } from 'mcp-2-cli';

const config = {
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
  transport: 'stdio',
};

const cli = await createMcpCli(config, 'my-cli');
await cli.parseAsync();
```

### CLI Commands

Once you've created a CLI, you automatically get these commands:

#### Prompts

```bash
# List all available prompts
my-cli prompts list

# Get a specific prompt (with optional arguments as JSON)
my-cli prompts get <prompt-name> --args '{"arg1": "value1"}'
```

#### Resources

```bash
# List all available resources
my-cli resources list

# Get a specific resource
my-cli resources get <resource-uri>
```

#### Tools

```bash
# List all available tools
my-cli tools list

# Call a tool (with optional arguments as JSON)
my-cli tools call <tool-name> --args '{"param1": "value1"}'
```

## API

### `createMcpCli(config, cliName?)`

Creates a CLI wrapper around an MCP server.

- `config`: `McpServerConfig` - Configuration for the MCP server
  - `command`: string - The command to run the MCP server
  - `args?`: string[] - Arguments for the command
  - `env?`: Record<string, string> - Environment variables
  - `transport?`: 'stdio' | 'sse' - Transport type (currently only stdio is supported)
- `cliName?`: string - Name for the CLI (default: 'mcp-cli')

Returns: `Promise<Argv>` - A yargs CLI instance

### `McpCliBuilder`

Lower-level API for building CLIs with more control.

```typescript
import { McpCliBuilder } from 'mcp-2-cli';

const builder = new McpCliBuilder(config, 'my-cli');
const cli = await builder.build();
await cli.parseAsync();
await builder.cleanup();
```

## Architecture

The library consists of several modular components:

- **`mcp-client.ts`**: Wrapper around the MCP SDK client
- **`cli-builder.ts`**: Yargs CLI builder that generates commands
- **`validator.ts`**: JSON Schema validator for tool arguments
- **`types.ts`**: TypeScript type definitions

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint
```

## TODO Items

See inline code comments prefixed with `TODO:` for areas that need attention:

- Support for additional transport types (SSE, HTTP)
- Exact shape of MCP server config may need refinement based on SDK docs
- Integration tests with actual MCP servers
- Enhanced error messages and user feedback

## License

ISC

