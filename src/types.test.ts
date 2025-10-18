import { describe, it } from "node:test";
import assert from "node:assert";
import type {
  McpServerConfig,
  McpError,
  McpPrompt,
  McpResource,
  McpTool,
  McpToolResult,
} from "./types.js";

describe("Types", () => {
  describe("McpServerConfig", () => {
    it("should allow valid server config", () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        env: { NODE_ENV: "test" },
        transport: "stdio",
        name: "mcp-cli",
      };
      assert.strictEqual(config.command, "node");
      assert.deepStrictEqual(config.args, ["server.js"]);
    });

    it("should allow minimal config", () => {
      const config: McpServerConfig = {
        command: "node",
        transport: "stdio",
        name: "mcp-cli",
      };
      assert.strictEqual(config.command, "node");
    });
  });

  describe("McpError", () => {
    it("should structure JSONRPC errors correctly", () => {
      const error: McpError = {
        code: -32600,
        message: "Invalid Request",
        data: { details: "Additional info" },
      };
      assert.strictEqual(error.code, -32600);
      assert.strictEqual(error.message, "Invalid Request");
    });
  });

  describe("McpPrompt", () => {
    it("should allow prompt with arguments", () => {
      const prompt: McpPrompt = {
        name: "test-prompt",
        description: "A test prompt",
        arguments: [
          { name: "arg1", description: "First arg", required: true },
          { name: "arg2", required: false },
        ],
      };
      assert.strictEqual(prompt.name, "test-prompt");
      assert.strictEqual(prompt.arguments?.length, 2);
    });
  });

  describe("McpResource", () => {
    it("should structure resource correctly", () => {
      const resource: McpResource = {
        uri: "file:///test.txt",
        name: "test.txt",
        description: "A test file",
        mimeType: "text/plain",
      };
      assert.strictEqual(resource.uri, "file:///test.txt");
      assert.strictEqual(resource.mimeType, "text/plain");
    });
  });

  describe("McpTool", () => {
    it("should structure tool with schema", () => {
      const tool: McpTool = {
        name: "test-tool",
        description: "A test tool",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string" },
          },
          required: ["message"],
        },
      };
      assert.strictEqual(tool.name, "test-tool");
      assert.strictEqual(tool.inputSchema.type, "object");
    });
  });

  describe("McpToolResult", () => {
    it("should structure tool result", () => {
      const result: McpToolResult = {
        content: [{ type: "text", text: "Success" }],
        isError: false,
      };
      assert.strictEqual(result.content.length, 1);
      assert.strictEqual(result.isError, false);
    });

    it("should allow error results", () => {
      const result: McpToolResult = {
        content: [{ type: "text", text: "Error occurred" }],
        isError: true,
      };
      assert.strictEqual(result.isError, true);
    });
  });
});
