/**
 * @fileoverview Core Model Context Protocol (MCP) server implementation.
 * Exposes downstream adapters as standardized JSON-RPC tools for the agentic workforce.
 */

import { IsolationContext } from './isolation_context';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>; // Standard JSON schema format
}

export interface McpResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export abstract class OneMcpServer {
  private readonly toolRegistry = new Map<string, {
    definition: McpToolDefinition;
    handler: (context: IsolationContext, args: any) => Promise<any>;
  }>();

  constructor(protected readonly serverName: string) {}

  /**
   * Registers a capability as an MCP-compliant tool.
   */
  protected registerTool(
    definition: McpToolDefinition,
    handler: (context: IsolationContext, args: any) => Promise<any>
  ): void {
    if (this.toolRegistry.has(definition.name)) {
      throw new Error(`Conflict: Tool with name ${definition.name} is already registered on ${this.serverName}.`);
    }
    this.toolRegistry.set(definition.name, { definition, handler });
  }

  /**
   * Standard tools/list JSON-RPC handler for discovery.
   */
  public async listTools(context: IsolationContext): Promise<McpToolDefinition[]> {
    // Audit discovery action
    console.info(`[OneMCP Server: ${this.serverName}] Listing tools for Org: ${context.orgId}`);
    return Array.from(this.toolRegistry.values()).map(t => t.definition);
  }

  /**
   * Standard tools/call JSON-RPC execution entrypoint.
   */
  public async callTool(
    context: IsolationContext,
    toolName: string,
    args: any,
    rpcId: string | number
  ): Promise<McpResponse> {
    const tool = this.toolRegistry.get(toolName);
    if (!tool) {
      return {
        jsonrpc: '2.0',
        id: rpcId,
        error: {
          code: -32601,
          message: `Method not found: Tool '${toolName}' is not registered on MCP Server '${this.serverName}'.`
        }
      };
    }

    try {
      // Validate schema
      this.validateSchema(tool.definition.inputSchema, args);

      const result = await tool.handler(context, args);
      return {
        jsonrpc: '2.0',
        id: rpcId,
        result
      };
    } catch (error: any) {
      return {
        jsonrpc: '2.0',
        id: rpcId,
        error: {
          code: -32000,
          message: error.message || 'Internal execution failure.',
          data: { orgId: context.orgId, spaceId: context.spaceId }
        }
      };
    }
  }

  private validateSchema(schema: Record<string, any>, args: any): void {
    if (!args) {
      throw new Error('Validation Error: Input arguments cannot be null or undefined.');
    }
    const requiredKeys = schema['required'] || [];
    for (const key of requiredKeys) {
      if (!(key in args)) {
        throw new Error(`Validation Error: Missing required parameter '${key}'.`);
      }
    }
  }
}
