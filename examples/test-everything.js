import { createMcpCli } from "../build/lib.js";

// Test with the "everything" MCP server which has prompts, resources, and tools
const config = {
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-everything"],
  transport: "stdio",
};

const cli = await createMcpCli(config, "everything-cli");
await cli.parseAsync();
