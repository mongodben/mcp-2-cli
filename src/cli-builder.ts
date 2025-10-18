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
    const isTopLevelHelpOrVersion =
      args.length === 0 ||
      (args.length === 1 &&
        (args[0] === "--help" ||
          args[0] === "-h" ||
          args[0] === "--version" ||
          args[0] === "-v"));

    if (!isTopLevelHelpOrVersion) {
      // Connect to MCP server to introspect available capabilities
      await this.mcpClient.connect();

      // Load tools for validation
      this.tools = await this.mcpClient.listTools();
      this.tools.forEach((tool) => this.validator.registerTool(tool));
    }

    const cli = yargs(args)
      .scriptName(this.cliName)
      .version("0.0.1")
      .help()
      .alias("help", "h")
      .alias("version", "v")
      .demandCommand(1, "You must provide a command")
      .strict()
      .exitProcess(true);

    // Add prompts commands
    this.addPromptsCommands(cli);

    // Add resources commands
    this.addResourcesCommands(cli);

    // Add tools commands
    this.addToolsCommands(cli);

    return cli;
  }

  /**
   * Add prompts subcommands (list and get)
   */
  private addPromptsCommands(cli: Argv): void {
    cli.command("prompts", "Interact with MCP prompts", (yargs) => {
      return yargs
        .command("list", "List all available prompts", {}, async () => {
          try {
            const prompts = await this.mcpClient.listPrompts();
            console.log(JSON.stringify(prompts, null, 2));
            await this.cleanup();
            process.exit(0);
          } catch (error) {
            this.handleError(error);
          }
        })
        .command(
          "get <name>",
          "Get a specific prompt",
          (yargs) => {
            return yargs
              .positional("name", {
                describe: "The name of the prompt",
                type: "string",
                demandOption: true,
              })
              .option("args", {
                describe: "JSON string of arguments for the prompt",
                type: "string",
              });
          },
          async (argv) => {
            try {
              let promptArgs: Record<string, string> | undefined;
              if (argv.args && typeof argv.args === "string") {
                try {
                  promptArgs = JSON.parse(argv.args);
                } catch {
                  throw new Error("Invalid JSON in --args parameter");
                }
              }
              const result = await this.mcpClient.getPrompt(
                argv.name as string,
                promptArgs
              );
              console.log(JSON.stringify(result, null, 2));
              await this.cleanup();
              process.exit(0);
            } catch (error) {
              this.handleError(error);
            }
          }
        )
        .demandCommand(1, "You must provide a prompts subcommand");
    });
  }

  /**
   * Add resources subcommands (list and get)
   */
  private addResourcesCommands(cli: Argv): void {
    cli.command("resources", "Interact with MCP resources", (yargs) => {
      return yargs
        .command("list", "List all available resources", {}, async () => {
          try {
            const resources = await this.mcpClient.listResources();
            console.log(JSON.stringify(resources, null, 2));
            await this.cleanup();
            process.exit(0);
          } catch (error) {
            this.handleError(error);
          }
        })
        .command(
          "get <uri>",
          "Get a specific resource",
          (yargs) => {
            return yargs.positional("uri", {
              describe: "The URI of the resource",
              type: "string",
              demandOption: true,
            });
          },
          async (argv) => {
            try {
              const result = await this.mcpClient.getResource(
                argv.uri as string
              );
              console.log(JSON.stringify(result, null, 2));
              await this.cleanup();
              process.exit(0);
            } catch (error) {
              this.handleError(error);
            }
          }
        )
        .demandCommand(1, "You must provide a resources subcommand");
    });
  }

  /**
   * Add tools subcommands (list and individual tool commands)
   */
  private addToolsCommands(cli: Argv): void {
    cli.command("tools", "Interact with MCP tools", (toolsYargs) => {
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
                type: (prop.type === "number"
                  ? "number"
                  : prop.type === "boolean"
                  ? "boolean"
                  : "string") as "string" | "number" | "boolean",
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
