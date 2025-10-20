import { z } from "zod";

// Base config schema
const BaseConfigSchema = z.object({
  name: z.string().default("mcp-cli"),
});

// Stdio transport config
const StdioConfigSchema = BaseConfigSchema.extend({
  transport: z.literal("stdio"),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

// OAuth config for HTTP transport
const OAuthConfigSchema = z.object({
  clientId: z.string().optional(),
  authorizationEndpoint: z.string().url().optional(),
  tokenEndpoint: z.string().url().optional(),
  redirectUri: z.string().url().optional(),
  scopes: z.array(z.string()).optional(),
  registrationEndpoint: z.string().url().optional(),
  port: z.number().optional(),
});

// HTTP transport config
const HttpConfigSchema = BaseConfigSchema.extend({
  transport: z.literal("http"),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  bearerToken: z.string().optional(),
  oauth: OAuthConfigSchema.optional(),
});

// Union of all transport configs
export const McpServerConfigSchema = z.discriminatedUnion("transport", [
  StdioConfigSchema,
  HttpConfigSchema,
]);

/**
 * MCP Server Configuration
 * Supports both stdio and HTTP transports
 */
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
export type StdioConfig = z.infer<typeof StdioConfigSchema>;
export type HttpConfig = z.infer<typeof HttpConfigSchema>;

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
    type: "object";
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
