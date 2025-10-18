import yargs, { Argv } from "yargs";
import { hideBin } from "yargs/helpers";
import { McpClientWrapper } from "./mcp-client.js";
import { McpServerConfig } from "./types.js";
import { ArgumentValidator } from "./validator.js";

/**
 * Builder function that creates a CLI wrapper around an MCP server
 * The CLI is not initialized until .build() is called
 */
export class McpCliBuilder {
  private mcpClient: McpClientWrapper;
  private validator: ArgumentValidator;
  private cliName: string;
  private tools: import("./types.js").McpTool[] = [];
  private prompts: import("./types.js").McpPrompt[] = [];
  private resources: import("./types.js").McpResource[] = [];

  constructor(serverConfig: McpServerConfig, cliName = "mcp-cli") {
    this.mcpClient = new McpClientWrapper(serverConfig);
    this.validator = new ArgumentValidator();
    this.cliName = cliName;
  }

  /**
   * Build and return the yargs CLI instance
   * This is where we set up all the commands
   */
  async build(): Promise<Argv> {
    // Check if ONLY help or version is requested at top level
    // We still need to connect if there are subcommands (like "tools read_text_file --help")
    const args = hideBin(process.argv);

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

    if (this.prompts.length > 0) {
      this.addPromptsCommands(cli, this.cliName);
    }

    if (this.resources.length > 0) {
      this.addResourcesCommands(cli, this.cliName);
    }

    if (this.tools.length > 0) {
      this.addToolsCommands(cli, this.cliName);
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
  serverConfig: McpServerConfig,
  cliName?: string
): Promise<Argv> {
  const builder = new McpCliBuilder(serverConfig, cliName);
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
