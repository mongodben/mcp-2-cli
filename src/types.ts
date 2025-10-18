/**
 * MCP Server Configuration
 * TODO: Determine the exact shape of server config based on MCP SDK documentation
 * This might need to support stdio, SSE, or other transport types
 */
export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  // TODO: Add support for other transport types (SSE, HTTP, etc.)
  transport?: 'stdio' | 'sse';
}

/**
 * Error response from MCP server following JSONRPC spec
 */
export interface McpError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * MCP Prompt definition
 */
export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

/**
 * MCP Resource definition
 */
export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * MCP Tool definition
 */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

/**
 * Result from calling an MCP tool
 */
export interface McpToolResult {
  content: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
  isError?: boolean;
}
