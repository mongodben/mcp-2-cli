import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  McpServerConfig,
  McpPrompt,
  McpResource,
  McpTool,
  McpToolResult,
  McpError,
} from './types.js';

/**
 * Wrapper around the MCP SDK Client to provide a simplified interface
 */
export class McpClientWrapper {
  private client: Client;
  private transport: StdioClientTransport | null = null;
  private connected = false;

  constructor(private config: McpServerConfig) {
    this.client = new Client(
      {
        name: 'mcp-2-cli',
        version: '0.0.1',
      },
      {
        capabilities: {
          prompts: {},
          resources: {},
          tools: {},
        },
      }
    );
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    // TODO: Add support for other transport types beyond stdio
    if (this.config.transport && this.config.transport !== 'stdio') {
      throw new Error(`Transport type '${this.config.transport}' not yet supported`);
    }

    this.transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args || [],
      env: this.config.env,
    });

    await this.client.connect(this.transport);
    this.connected = true;
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (this.connected && this.transport) {
      await this.client.close();
      this.connected = false;
      this.transport = null;
    }
  }

  /**
   * Ensure client is connected before operations
   */
  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('MCP client not connected. Call connect() first.');
    }
  }

  /**
   * List all available prompts
   */
  async listPrompts(): Promise<McpPrompt[]> {
    this.ensureConnected();
    const response = await this.client.listPrompts();
    return response.prompts as McpPrompt[];
  }

  /**
   * Get a specific prompt with arguments
   */
  async getPrompt(name: string, args?: Record<string, string>): Promise<unknown> {
    this.ensureConnected();
    const response = await this.client.getPrompt({ name, arguments: args });
    return response;
  }

  /**
   * List all available resources
   */
  async listResources(): Promise<McpResource[]> {
    this.ensureConnected();
    const response = await this.client.listResources();
    return response.resources as McpResource[];
  }

  /**
   * Get a specific resource
   */
  async getResource(uri: string): Promise<unknown> {
    this.ensureConnected();
    const response = await this.client.readResource({ uri });
    return response;
  }

  /**
   * List all available tools
   */
  async listTools(): Promise<McpTool[]> {
    this.ensureConnected();
    const response = await this.client.listTools();
    return response.tools as McpTool[];
  }

  /**
   * Call a tool with arguments
   */
  async callTool(name: string, args?: Record<string, unknown>): Promise<McpToolResult> {
    this.ensureConnected();
    try {
      const response = await this.client.callTool({ name, arguments: args || {} });
      return response as McpToolResult;
    } catch (error) {
      // Handle JSONRPC errors from MCP
      if (this.isJsonRpcError(error)) {
        throw this.formatMcpError(error);
      }
      throw error;
    }
  }

  /**
   * Check if error is a JSONRPC error
   */
  private isJsonRpcError(error: unknown): error is { code: number; message: string; data?: unknown } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error &&
      typeof (error as { code: unknown }).code === 'number' &&
      typeof (error as { message: unknown }).message === 'string'
    );
  }

  /**
   * Format MCP error for user-friendly output
   */
  private formatMcpError(error: { code: number; message: string; data?: unknown }): Error {
    const mcpError: McpError = {
      code: error.code,
      message: error.message,
      data: error.data,
    };
    const errorMessage = `MCP Error [${mcpError.code}]: ${mcpError.message}${
      mcpError.data ? `\nData: ${JSON.stringify(mcpError.data, null, 2)}` : ''
    }`;
    return new Error(errorMessage);
  }
}
