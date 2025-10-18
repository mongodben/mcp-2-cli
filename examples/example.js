/**
 * Example usage of mcp-2-cli
 *
 * This demonstrates how to create a CLI wrapper around an MCP server
 */

import { createMcpCli } from "../build/index.js";
import console from "console";
import process from "process";

// Example: Wrapping a filesystem MCP server
async function main() {
  // TODO: Replace this with a real MCP server configuration
  // For example, you might use @modelcontextprotocol/server-filesystem
  const config = {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    transport: "stdio",
  };

  try {
    // Create the CLI (this connects to the MCP server and introspects it)
    const cli = await createMcpCli(config, "fs-cli");

    // Parse and execute the command
    await cli.parseAsync();
  } catch (error) {
    console.error("Failed to initialize CLI:", error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
