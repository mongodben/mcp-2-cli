import { createMcpCli } from "../build/index.js";

const config = {
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", process.cwd()],
  transport: "stdio",
};

const cli = await createMcpCli(config, "test-cli");
await cli.parseAsync();
