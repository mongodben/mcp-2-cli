import Ajv, { ValidateFunction } from 'ajv';
import { McpTool } from './types.js';

/**
 * Validator for MCP tool arguments using JSON Schema
 */
export class ArgumentValidator {
  private ajv: Ajv;
  private validators: Map<string, ValidateFunction>;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    this.validators = new Map();
  }

  /**
   * Register a tool schema for validation
   */
  registerTool(tool: McpTool): void {
    const validator = this.ajv.compile(tool.inputSchema);
    this.validators.set(tool.name, validator);
  }

  /**
   * Validate arguments against a tool's schema
   */
  validate(toolName: string, args: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const validator = this.validators.get(toolName);
    if (!validator) {
      throw new Error(`No validator registered for tool: ${toolName}`);
    }

    const valid = validator(args);
    if (!valid && validator.errors) {
      const errors = validator.errors.map((err) => {
        const path = err.instancePath || 'root';
        return `${path}: ${err.message}`;
      });
      return { valid: false, errors };
    }

    return { valid: true };
  }

  /**
   * Get required fields for a tool
   */
  getRequiredFields(toolName: string): string[] {
    const validator = this.validators.get(toolName);
    if (!validator) {
      throw new Error(`No validator registered for tool: ${toolName}`);
    }

    // Access the schema from the validator
    const schema = validator.schema as { required?: string[] };
    return schema.required || [];
  }

  /**
   * Get all registered field names for a tool
   */
  getFieldNames(toolName: string): string[] {
    const validator = this.validators.get(toolName);
    if (!validator) {
      throw new Error(`No validator registered for tool: ${toolName}`);
    }

    const schema = validator.schema as { properties?: Record<string, unknown> };
    return Object.keys(schema.properties || {});
  }
}
