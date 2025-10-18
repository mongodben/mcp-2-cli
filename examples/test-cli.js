import { createMcpCli } from "../build/lib.js";
import process from "process";

const config = {
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", process.cwd()],
  transport: "stdio",
};

const cli = await createMcpCli(config, "test-cli");
await cli.parseAsync();
