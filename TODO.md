# TODOs

- [ ] Load in MCP server using the MCP client library https://www.npmjs.com/package/mcp-client
- [ ] build constructor function that accepts the MCP server config and returns a CLI. the CLI should not be initialized yet
- [ ] Use `yargs` as CLI that wraps the MCP commands.
- [ ] Support MCP prompts. list prompts and get prompt commands
  - API: `<cli-name> prompts list` and `<cli-name> prompts get <prompt-name> --<argument1> <val1>...`
  - refer to MCP prompts doc https://modelcontextprotocol.io/specification/2025-03-26/server/prompts
- [ ] support MCP resources. list resources and get resource commands
  - same idea as for prompts
  - refer to resources doc https://modelcontextprotocol.io/specification/2025-03-26/server/resources
- [ ] support for MCP tools. list tools and call tool commands
  - refer to tools doc https://modelcontextprotocol.io/specification/2025-03-26/server/tools#calling-tools
- [ ] ensure that there's good data validation on the command arguments. for example for tools, make sure that optional/required is respected and the data types are correct. 
  - may need to use a JSON schema data validation library here
- [ ] graceful error handling. 
  - since MCP uses JSONRPC, need to take that into acct. see https://modelcontextprotocol.io/specification/2025-03-26/server/tools#error-handling for how errs are returned

