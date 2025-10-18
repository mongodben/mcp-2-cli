/**
 * mcp-2-cli - Convert any MCP server to a CLI application
 *
 * Main entry point for the library
 */

export { createMcpCli, McpCliBuilder } from './cli-builder.js';
export { McpClientWrapper } from './mcp-client.js';
export { ArgumentValidator } from './validator.js';
export type {
  McpServerConfig,
  McpError,
  McpPrompt,
  McpResource,
  McpTool,
  McpToolResult,
} from './types.js';
