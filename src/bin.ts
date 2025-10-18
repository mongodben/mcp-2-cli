#!/usr/bin/env node

import { createMcpCli } from "./lib.js";
import { readFile } from "fs/promises";
import { resolve } from "path";
import process from "process";
import console from "console";
import { McpServerConfigSchema } from "./types.js";

/**
 * Load MCP server configuration from JSON file
 * Priority:
 * 1. MCP_2_CLI_CONFIG_PATH environment variable
 * 2. mcp-2-cli.config.json in current working directory
 */
async function loadConfig() {
  let configPath;

  // Check environment variable first
  if (process.env.MCP_2_CLI_CONFIG_PATH) {
    configPath = resolve(process.env.MCP_2_CLI_CONFIG_PATH);
  } else {
    // Default to config file in current directory
    configPath = resolve(process.cwd(), "mcp-2-cli.config.json");
  }

  try {
    const configData = await readFile(configPath, "utf-8");
    const config = McpServerConfigSchema.parse(JSON.parse(configData));
    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      console.error(
        `Error: Config file not found at ${configPath}\n\n` +
          `Please create a config file at one of:\n` +
          `  1. mcp-2-cli.config.json in current directory\n` +
          `  2. Path specified in MCP_2_CLI_CONFIG_PATH environment variable\n\n` +
          `Example config:\n` +
          JSON.stringify(
            {
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
              transport: "stdio",
            },
            null,
            2
          )
      );
      process.exit(1);
    } else if (error instanceof SyntaxError) {
      console.error(`Error: Invalid JSON in config file ${configPath}`);
      console.error(error.message);
      process.exit(1);
    } else {
      console.error(`Error loading config: ${(error as Error).message}`);
      process.exit(1);
    }
  }
}

// Main execution
try {
  const config = await loadConfig();
  const cli = await createMcpCli(config);
  await cli.parseAsync();
} catch (error) {
  console.error(`Error: ${(error as Error).message}`);
  process.exit(1);
}
