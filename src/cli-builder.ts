import yargs, { Argv } from "yargs";
import { hideBin } from "yargs/helpers";
import { McpClientWrapper } from "./mcp-client.js";
import { McpServerConfig, HttpConfig } from "./types.js";
import { ArgumentValidator } from "./validator.js";
import { OAuthManager } from "./oauth-manager.js";
import { homedir } from "os";
import { join } from "path";
import { unlink } from "fs/promises";
import { existsSync } from "fs";

/**
 * Builder function that creates a CLI wrapper around an MCP server
 * The CLI is not initialized until .build() is called
 */
export class McpCliBuilder {
  private mcpClient: McpClientWrapper;
  private validator: ArgumentValidator;
  private cliName: string;
  private serverConfig: McpServerConfig;
  private tools: import("./types.js").McpTool[] = [];
  private prompts: import("./types.js").McpPrompt[] = [];
  private resources: import("./types.js").McpResource[] = [];

  constructor(serverConfig: McpServerConfig) {
    this.serverConfig = serverConfig;
    this.mcpClient = new McpClientWrapper(serverConfig);
    this.validator = new ArgumentValidator();
    this.cliName = serverConfig.name;
  }

  /**
   * Build and return the yargs CLI instance
   * This is where we set up all the commands
   */
  async build(): Promise<Argv> {
    // Check if ONLY help or version is requested at top level
    // We still need to connect if there are subcommands (like "tools read_text_file --help")
    const args = hideBin(process.argv);

    // Check if this is an auth command for HTTP transport
    const isAuthCommand =
      this.serverConfig.transport === "http" &&
      args.length > 0 &&
      args[0] === "auth";

    // Check if version is requested (no need to connect)
    const isVersionOnly =
      args.length === 1 &&
      (args[0] === "-v" || args[0] === "--version");

    // Skip connection only for auth commands and version flag
    // For help, we SHOULD connect to show accurate available commands
    if (!isAuthCommand && !isVersionOnly) {
      // Connect to MCP server to introspect available capabilities
      await this.mcpClient.connect();

      // Load all capabilities (some servers may not support all capabilities)
      try {
        this.prompts = await this.mcpClient.listPrompts();
      } catch {
        // Prompts not supported, skip
        this.prompts = [];
      }

      try {
        this.resources = await this.mcpClient.listResources();
      } catch {
        // Resources not supported, skip
        this.resources = [];
      }

      try {
        this.tools = await this.mcpClient.listTools();
        this.tools.forEach((tool) => this.validator.registerTool(tool));
      } catch (error) {
        console.error("Error listing tools", error);

        // Tools not supported, skip
        this.tools = [];
      }
    }

    const cli = yargs(args)
      .scriptName(this.cliName)
      .version("0.0.1")
      .help()
      .alias("help", "h")
      .alias("help", "list")
      .alias("version", "v")
      .demandCommand(1, "You must provide a command")
      .strict()
      .exitProcess(true);

    // Add actual commands based on what the server provides
    if (this.prompts.length > 0) {
      this.addPromptsCommands(cli, this.cliName);
    }

    if (this.resources.length > 0) {
      this.addResourcesCommands(cli, this.cliName);
    }

    if (this.tools.length > 0) {
      this.addToolsCommands(cli, this.cliName);
    }

    // Add auth commands for HTTP transport
    if (this.serverConfig.transport === "http") {
      this.addAuthCommands(cli);
    }

    return cli;
  }

  /**
   * Add prompts subcommands (list and individual prompt commands)
   */
  private addPromptsCommands(cli: Argv, cliName: string): void {
    cli.command(
      "prompts",
      `Interact with ${cliName} prompts`,
      (promptsYargs) => {
        // Add an individual command for each prompt
        this.prompts.forEach((prompt) => {
          const promptArgs = prompt.arguments || [];

          promptsYargs = promptsYargs.command(
            prompt.name,
            prompt.description || `Get ${prompt.name} prompt`,
            (yargs): Argv => {
              // Add options for each argument
              promptArgs.forEach((arg) => {
                yargs.option(arg.name, {
                  describe: arg.description || arg.name,
                  type: "string",
                  demandOption: arg.required || false,
                });
              });
              return yargs;
            },
            async (argv): Promise<void> => {
              try {
                // Build prompt args from argv
                const args: Record<string, string> = {};
                promptArgs.forEach((arg) => {
                  if (argv[arg.name] !== undefined) {
                    args[arg.name] = argv[arg.name] as string;
                  }
                });

                const result = await this.mcpClient.getPrompt(
                  prompt.name,
                  args
                );
                console.log(JSON.stringify(result, null, 2));
                await this.cleanup();
                process.exit(0);
              } catch (error) {
                this.handleError(error);
              }
            }
          );
        });

        return promptsYargs.demandCommand(
          1,
          "You must provide a prompts subcommand"
        );
      }
    );
  }

  /**
   * Add resources subcommands (list and individual resource commands)
   */
  private addResourcesCommands(cli: Argv, cliName: string): void {
    cli.command(
      "resources",
      `Interact with ${cliName} resources`,
      (resourcesYargs) => {
        // Add an individual command for each resource
        this.resources.forEach((resource) => {
          // Create a sanitized command name from the URI
          // Replace non-alphanumeric chars with underscores
          const commandName = resource.uri.replace(/[^a-zA-Z0-9]/g, "_");

          resourcesYargs = resourcesYargs.command(
            commandName,
            resource.description || `Get resource: ${resource.name}`,
            {},
            this.wrapHandler(async () =>
              this.mcpClient.getResource(resource.uri)
            )
          );
        });

        return resourcesYargs.demandCommand(
          1,
          "You must provide a resources subcommand"
        );
      }
    );
  }

  /**
   * Add tools subcommands (list and individual tool commands)
   */
  private addToolsCommands(cli: Argv, cliName: string): void {
    cli.command("tools", `Interact with ${cliName} tools`, (toolsYargs) => {
      // Add an individual command for each tool
      this.tools.forEach((tool) => {
        const schema = tool.inputSchema;
        const requiredFields = schema.required || [];
        const properties = schema.properties || {};

        toolsYargs = toolsYargs.command(
          tool.name,
          tool.description || `Call ${tool.name} tool`,
          (yargs): Argv => {
            // Add options for each property in the schema
            Object.entries(properties).forEach(([propName, propSchema]) => {
              const prop = propSchema as {
                type?: string;
                description?: string;
              };
              yargs.option(propName, {
                describe: prop.description || propName,
                type: this.schemaTypeToYargsType(prop.type),
                demandOption: requiredFields.includes(propName),
              });
            });
            return yargs;
          },
          async (argv): Promise<void> => {
            try {
              // Build tool args from argv, excluding yargs internal props
              const toolArgs: Record<string, unknown> = {};
              Object.keys(properties).forEach((propName) => {
                if (argv[propName] !== undefined) {
                  toolArgs[propName] = argv[propName];
                }
              });

              // Validate arguments
              const validation = this.validator.validate(tool.name, toolArgs);
              if (!validation.valid) {
                throw new Error(
                  `Validation failed:\n${validation.errors?.join("\n")}`
                );
              }

              const result = await this.mcpClient.callTool(tool.name, toolArgs);
              console.log(JSON.stringify(result, null, 2));
              await this.cleanup();
              process.exit(0);
            } catch (error) {
              this.handleError(error);
            }
          }
        );
      });

      return toolsYargs.demandCommand(1, "You must provide a tools subcommand");
    });
  }

  /**
   * Helper: Wrap a command handler with cleanup and exit
   */
  private wrapHandler<T>(handler: () => Promise<T>): () => Promise<void> {
    return async (): Promise<void> => {
      try {
        const result = await handler();
        console.log(JSON.stringify(result, null, 2));
        await this.cleanup();
        process.exit(0);
      } catch (error) {
        this.handleError(error);
      }
    };
  }

  /**
   * Helper: Convert JSON schema type to yargs type
   */
  private schemaTypeToYargsType(
    schemaType?: string
  ): "string" | "number" | "boolean" {
    return (
      schemaType === "number"
        ? "number"
        : schemaType === "boolean"
        ? "boolean"
        : "string"
    ) as "string" | "number" | "boolean";
  }

  /**
   * Add auth subcommands for HTTP transport (login, logout, status)
   */
  private addAuthCommands(cli: Argv): void {
    const httpConfig = this.serverConfig as HttpConfig;

    cli.command(
      "auth",
      "Manage authentication for HTTP MCP server",
      (authYargs) => {
        // Login command
        authYargs.command(
          "login",
          "Authenticate with the MCP server using OAuth",
          {},
          async (): Promise<void> => {
            try {
              if (!httpConfig.oauth && !httpConfig.bearerToken) {
                console.error("Error: No authentication configured for this server");
                console.error("\nPlease add either:");
                console.error('  - "oauth": {} for OAuth flow (will attempt dynamic registration)');
                console.error('  - "oauth": { "clientId": "..." } for OAuth with known client ID');
                console.error('  - "bearerToken": "..." for pre-authenticated access');
                process.exit(1);
              }

              if (httpConfig.bearerToken) {
                console.error("Error: Server uses bearer token authentication");
                console.error("No login required - token is already configured in the config file");
                process.exit(1);
              }

              if (!httpConfig.oauth) {
                console.error("Error: OAuth not configured for this server");
                process.exit(1);
              }

              console.log(`Authenticating with ${httpConfig.url}...`);

              let oauthConfig = httpConfig.oauth;

              // If OAuth endpoints are not configured, discover them from the server
              if (!oauthConfig.authorizationEndpoint || !oauthConfig.tokenEndpoint) {
                console.log("Discovering OAuth endpoints...");

                // Method 1: Try WWW-Authenticate header (MCP spec compliant)
                const response = await fetch(httpConfig.url, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                  },
                  body: JSON.stringify({
                    jsonrpc: "2.0",
                    method: "initialize",
                    id: 1,
                    params: {
                      protocolVersion: "2024-11-05",
                      capabilities: {},
                      clientInfo: { name: this.cliName, version: "0.0.1" },
                    },
                  }),
                });

                if (response.status === 401) {
                  const wwwAuthenticate = response.headers.get("WWW-Authenticate");

                  if (wwwAuthenticate) {
                    // MCP spec compliant - use WWW-Authenticate header
                    const discoveredConfig = await OAuthManager.handleUnauthorized(
                      wwwAuthenticate,
                      oauthConfig.clientId
                    );

                    oauthConfig = {
                      ...oauthConfig,
                      ...discoveredConfig,
                    };

                    console.log("✓ OAuth endpoints discovered via WWW-Authenticate");
                  } else {
                    // Method 2: Fall back to well-known endpoint
                    console.log("No WWW-Authenticate header, trying .well-known endpoint...");

                    const serverUrl = new URL(httpConfig.url);
                    const wellKnownUrl = `${serverUrl.protocol}//${serverUrl.host}/.well-known/oauth-authorization-server`;

                    const wellKnownResponse = await fetch(wellKnownUrl);
                    if (!wellKnownResponse.ok) {
                      throw new Error(
                        `Failed to discover OAuth endpoints. Server returned 401 but:\n` +
                        `  - No WWW-Authenticate header found\n` +
                        `  - No .well-known/oauth-authorization-server endpoint available\n\n` +
                        `Please configure OAuth endpoints manually in your config file.`
                      );
                    }

                    const metadata = await wellKnownResponse.json() as {
                      authorization_endpoint: string;
                      token_endpoint: string;
                      registration_endpoint?: string;
                    };

                    oauthConfig = {
                      ...oauthConfig,
                      authorizationEndpoint: metadata.authorization_endpoint,
                      tokenEndpoint: metadata.token_endpoint,
                      registrationEndpoint: metadata.registration_endpoint,
                    };

                    console.log("✓ OAuth endpoints discovered via .well-known");
                  }
                } else if (response.ok) {
                  throw new Error("Server did not require authentication (no 401 response)");
                } else {
                  throw new Error(`Unexpected response from server: ${response.status} ${response.statusText}`);
                }
              }

              const oauthManager = new OAuthManager(
                oauthConfig,
                this.cliName
              );
              await oauthManager.initialize();

              // Check if already authenticated
              if (oauthManager.hasValidToken()) {
                console.log("You are already authenticated!");
                console.log("Run 'auth logout' to remove existing credentials.");
                process.exit(0);
              }

              // Trigger OAuth flow
              await oauthManager.authorize(httpConfig.url);
              console.log("\n✓ Authentication successful!");
              console.log(
                `Tokens saved to ${join(homedir(), ".mcp-2-cli", `${this.cliName}.tokens.json`)}`
              );
              process.exit(0);
            } catch (error) {
              this.handleError(error);
            }
          }
        );

        // Logout command
        authYargs.command(
          "logout",
          "Remove saved authentication tokens",
          {},
          async (): Promise<void> => {
            try {
              const tokenPath = join(
                homedir(),
                ".mcp-2-cli",
                `${this.cliName}.tokens.json`
              );

              if (!existsSync(tokenPath)) {
                console.log("No saved tokens found.");
                process.exit(0);
              }

              await unlink(tokenPath);
              console.log("✓ Successfully logged out!");
              console.log(`Removed tokens from ${tokenPath}`);
              process.exit(0);
            } catch (error) {
              this.handleError(error);
            }
          }
        );

        // Status command
        authYargs.command(
          "status",
          "Check authentication status",
          {},
          async (): Promise<void> => {
            try {
              const tokenPath = join(
                homedir(),
                ".mcp-2-cli",
                `${this.cliName}.tokens.json`
              );

              if (!existsSync(tokenPath)) {
                console.log("Status: Not authenticated");
                console.log("\nRun 'auth login' to authenticate.");
                process.exit(0);
              }

              if (!httpConfig.oauth) {
                console.log("Status: Using bearer token");
                process.exit(0);
              }

              const oauthManager = new OAuthManager(
                httpConfig.oauth,
                this.cliName
              );
              await oauthManager.initialize();

              if (oauthManager.hasValidToken()) {
                console.log("Status: Authenticated ✓");
                console.log(`Token file: ${tokenPath}`);
                console.log("\nYou can use all CLI commands.");
              } else {
                console.log("Status: Token expired");
                console.log("\nRun 'auth login' to re-authenticate.");
              }

              process.exit(0);
            } catch (error) {
              this.handleError(error);
            }
          }
        );

        return authYargs.demandCommand(1, "You must provide an auth subcommand");
      }
    );
  }

  /**
   * Handle and format errors gracefully
   */
  private handleError(error: unknown): void {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error(`Error: ${String(error)}`);
    }
    process.exit(1);
  }

  /**
   * Cleanup and disconnect
   */
  async cleanup(): Promise<void> {
    await this.mcpClient.disconnect();
  }
}

/**
 * Factory function to create an MCP CLI
 * This is the main entry point for users of this library
 */
export async function createMcpCli(
  serverConfig: McpServerConfig
): Promise<Argv> {
  const builder = new McpCliBuilder(serverConfig);
  const cli = await builder.build();

  // Setup cleanup on exit
  process.on("exit", () => {
    builder.cleanup().catch(console.error);
  });
  process.on("SIGINT", () => {
    builder.cleanup().catch(console.error);
    process.exit(0);
  });

  return cli;
}
