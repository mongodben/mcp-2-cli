# TODOs

- [x] Load in MCP server using the MCP client library 
- [x] build constructor function that accepts the MCP server config and returns a CLI. the CLI should not be initialized yet
- [x] Use `yargs` as CLI that wraps the MCP commands.
- [x] Support MCP prompts. list prompts and get prompt commands
  - API: `<cli-name> prompts` and `<cli-name> prompts <prompt-name> --<argument1> <val1>...`
  - refer to MCP prompts doc https://modelcontextprotocol.io/specification/2025-03-26/server/prompts
- [x] support MCP resources. list resources and get resource commands
  - same idea as for prompts
  - refer to resources doc https://modelcontextprotocol.io/specification/2025-03-26/server/resources
- [x] support for MCP tools. list tools and call tool commands
  - refer to tools doc https://modelcontextprotocol.io/specification/2025-03-26/server/tools#calling-tools
- [x] ensure that there's good data validation on the command arguments. for example for tools, make sure that optional/required is respected and the data types are correct. 
  - may need to use a JSON schema data validation library here
- [x] graceful error handling. 
  - since MCP uses JSONRPC, need to take that into acct. see https://modelcontextprotocol.io/specification/2025-03-26/server/tools#error-handling for how errs are returned
- [x] CLI as npx runnable binary ` MCP_2_CLI_CONFIG_PATH=path/to/config.json npx mcp-2-cli ...`
- [x] Supports stdio MCP servers
- [ ] Support Streamable HTTP MCP servers
  - will need to figure out how to do auth via oauth too..tricky

