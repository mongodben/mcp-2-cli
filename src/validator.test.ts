import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ArgumentValidator } from './validator.js';
import { McpTool } from './types.js';

describe('ArgumentValidator', () => {
  let validator: ArgumentValidator;

  beforeEach(() => {
    validator = new ArgumentValidator();
  });

  describe('registerTool', () => {
    it('should register a tool schema', () => {
      const tool: McpTool = {
        name: 'test-tool',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
          required: ['message'],
        },
      };

      validator.registerTool(tool);
      const fields = validator.getFieldNames('test-tool');
      assert.deepStrictEqual(fields, ['message']);
    });
  });

  describe('validate', () => {
    beforeEach(() => {
      const tool: McpTool = {
        name: 'test-tool',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            count: { type: 'number' },
          },
          required: ['message'],
        },
      };
      validator.registerTool(tool);
    });

    it('should validate valid arguments', () => {
      const result = validator.validate('test-tool', {
        message: 'hello',
        count: 5,
      });
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors, undefined);
    });

    it('should validate with missing optional fields', () => {
      const result = validator.validate('test-tool', {
        message: 'hello',
      });
      assert.strictEqual(result.valid, true);
    });

    it('should fail validation with missing required fields', () => {
      const result = validator.validate('test-tool', {
        count: 5,
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors);
      assert.ok(result.errors.length > 0);
    });

    it('should fail validation with wrong type', () => {
      const result = validator.validate('test-tool', {
        message: 'hello',
        count: 'not-a-number',
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors);
      assert.ok(result.errors.length > 0);
    });

    it('should throw error for unregistered tool', () => {
      assert.throws(() => {
        validator.validate('unknown-tool', {});
      }, /No validator registered/);
    });
  });

  describe('getRequiredFields', () => {
    it('should return required fields', () => {
      const tool: McpTool = {
        name: 'test-tool',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            optional: { type: 'string' },
          },
          required: ['message'],
        },
      };
      validator.registerTool(tool);

      const required = validator.getRequiredFields('test-tool');
      assert.deepStrictEqual(required, ['message']);
    });

    it('should return empty array when no required fields', () => {
      const tool: McpTool = {
        name: 'test-tool',
        inputSchema: {
          type: 'object',
          properties: {
            optional: { type: 'string' },
          },
        },
      };
      validator.registerTool(tool);

      const required = validator.getRequiredFields('test-tool');
      assert.deepStrictEqual(required, []);
    });
  });

  describe('getFieldNames', () => {
    it('should return all field names', () => {
      const tool: McpTool = {
        name: 'test-tool',
        inputSchema: {
          type: 'object',
          properties: {
            field1: { type: 'string' },
            field2: { type: 'number' },
            field3: { type: 'boolean' },
          },
        },
      };
      validator.registerTool(tool);

      const fields = validator.getFieldNames('test-tool');
      assert.deepStrictEqual(fields.sort(), ['field1', 'field2', 'field3'].sort());
    });

    it('should return empty array when no properties', () => {
      const tool: McpTool = {
        name: 'test-tool',
        inputSchema: {
          type: 'object',
        },
      };
      validator.registerTool(tool);

      const fields = validator.getFieldNames('test-tool');
      assert.deepStrictEqual(fields, []);
    });
  });
});
