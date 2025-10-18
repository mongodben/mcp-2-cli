# mcp-2-cli


Convert a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/docs/getting-started/intro) server to a CLI application.

This is useful if you want to use an MCP server's tools, resources, and prompts outside an MCP client. The `mcp-2-cli` library acts as a MCP client with the CLI as the interface.

You may want to use an MCP server's tools inside an [Agent Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview) or in a programmatic script.

## Features

- Automatically generates CLI commands from MCP server capabilities
- Supports MCP **prompts**, **resources**, and **tools**
- JSON Schema validation for tool arguments
- Graceful error handling with JSONRPC error support

## Supported Server Types

Currently, `mcp-2-cli` only supports stdio MCP servers.

Support for Streamable HTTP servers coming soon!

## Configuration

You must first create a JSON configuration file with the following schema:

```js
{
    "command": "<root command>", // Required
    "args": ["--additional", "args"] // Optional
    "transport": "stdio" // Required. currently only "stdio" supported
    "cliName": "<name>" // Optional. defaults to "mcp-cli"
}
```

For example: 
```js
{
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
  "transport": "stdio",
  "cliName": "fs-cli"
}
```

`mcp-2-cli` will first look for this file in the environment variable `MCP_2_CLI_CONFIG_PATH`.
If the environment variable is not provided, `mcp-2-cli` will look for a
file named `mcp-2-cli.config.json` in the current directory.

To run the MCP CLI, you can use `npx`: 

```sh
MCP_2_CLI_CONFIG_PATH="path/to/config.json" npx mcp-2-cli <args...>
```


## CLI Commands

An `mcp-2-cli` CLI automatically get commands for all available prompts, resources, and tools.

The generated CLI follows CLI best practices, with nested actions and `--help` commands.

The CLI commands use the following pattern:

```bash
mcp-cli <action> <name> --arg1 val1 --arg2 val2 ... 
```

For example, to use the [`server-filesystem` MCP's `read_text_file` tool](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem):

```bash
server-filesystem tools read_text_file --path path/to/file.ext
```

If there are not any available actions for one of the prompts, resources or tools action categories, those actions categories will not be listed. For example, if your server supports only tools but no prompts and resources, only `mcp-cli tools` would be a valid command.

### Prompts

```bash
# List all available prompts
mcp-cli prompts -help

# Get a specific prompt 
mcp-cli prompts <prompt-name>
# Get help with specific prompt
mcp-cli prompts <prompt-name> --help
```

### Resources

```bash
# List all available resources
mcp-cli resources -help

# Get a specific resource
mcp-cli resources <resource-uri>
# Get help with a specific resource
mcp-cli resources <resource-uri> --help
```

### Tools

```bash
# List all available tools
mcp-cli tools --help

# Call a tool (with optional arguments as JSON)
mcp-cli tools <tool-name> 
# Get help with a specific tool
mcp-cli tools <tool-name> --help
```

## Use as Library 

### Installation

```bash
npm install mcp-2-cli
```

### Basic Example

```typescript
import { createMcpCli } from 'mcp-2-cli';

const config = {
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
  transport: 'stdio',
  name: "filesystem-cli"
};

const cli = await createMcpCli(config);
await cli.parseAsync();
```
