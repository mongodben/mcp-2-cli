import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  McpServerConfig,
  McpPrompt,
  McpResource,
  McpTool,
  McpToolResult,
  McpError,
  StdioConfig,
  HttpConfig,
} from "./types.js";
import { StreamableHttpTransport } from "./http-transport.js";

/**
 * Wrapper around the MCP SDK Client to provide a simplified interface
 */
export class McpClientWrapper {
  private client: Client;
  private transport: Transport | null = null;
  private connected = false;

  constructor(private config: McpServerConfig) {
    this.client = new Client(
      {
        name: config.name || "mcp-cli",
        version: "0.0.1",
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

    // Create appropriate transport based on config
    if (this.config.transport === "stdio") {
      const stdioConfig = this.config as StdioConfig;
      this.transport = new StdioClientTransport({
        command: stdioConfig.command,
        args: stdioConfig.args || [],
        env: stdioConfig.env,
      });
    } else if (this.config.transport === "http") {
      const httpConfig = this.config as HttpConfig;
      this.transport = new StreamableHttpTransport(httpConfig);
    }

    if (!this.transport) {
      throw new Error(`Failed to create transport for type '${this.config.transport}'`);
    }

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
      throw new Error("MCP client not connected. Call connect() first.");
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
  async getPrompt(
    name: string,
    args?: Record<string, string>
  ): Promise<unknown> {
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
  async callTool(
    name: string,
    args?: Record<string, unknown>
  ): Promise<McpToolResult> {
    this.ensureConnected();
    try {
      const response = await this.client.callTool({
        name,
        arguments: args || {},
      });
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
  private isJsonRpcError(
    error: unknown
  ): error is { code: number; message: string; data?: unknown } {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      "message" in error &&
      typeof (error as { code: unknown }).code === "number" &&
      typeof (error as { message: unknown }).message === "string"
    );
  }

  /**
   * Format MCP error for user-friendly output
   */
  private formatMcpError(error: {
    code: number;
    message: string;
    data?: unknown;
  }): Error {
    const mcpError: McpError = {
      code: error.code,
      message: error.message,
      data: error.data,
    };
    const errorMessage = `MCP Error [${mcpError.code}]: ${mcpError.message}${
      mcpError.data ? `\nData: ${JSON.stringify(mcpError.data, null, 2)}` : ""
    }`;
    return new Error(errorMessage);
  }
}
