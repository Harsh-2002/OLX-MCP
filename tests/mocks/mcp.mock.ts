import { vi } from 'vitest';

/**
 * Mock implementations for MCP (Model Context Protocol) testing
 */

// Mock Server class from @modelcontextprotocol/server
export const mockMCPServer = {
  setRequestHandler: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
};

// SDK v2 request methods
export const mockListToolsMethod = 'tools/list';
export const mockCallToolMethod = 'tools/call';

// Mock MCP types and utilities
export const createMockMCPRequest = (name: string, args: Record<string, unknown> = {}) => ({
  method: 'tools/call',
  params: {
    name,
    arguments: args,
  },
});

export const createMockMCPResponse = (content: unknown) => ({
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify(content, null, 2),
    },
  ],
});

export const createMockListToolsResponse = (
  tools: Array<{ name: string; description: string; inputSchema: unknown }>
) => ({
  tools: tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  })),
});

// Mock transport for MCP server connection
export const mockMCPTransport = {
  send: vi.fn(),
  onMessage: vi.fn(),
  close: vi.fn(),
};

// Helper to create mock tool registration
export const createMockToolRegistration = (name: string, description: string) => ({
  name,
  description,
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
});

// Mock the entire MCP SDK
export const mockMCPSDK = () => {
  vi.mock('@modelcontextprotocol/server', () => ({
    Server: vi.fn().mockImplementation(() => mockMCPServer),
  }));
};

// Utility to simulate MCP tool calls
export const simulateToolCall = async (
  toolHandler: (request: {
    params: { name: string; arguments?: Record<string, unknown> };
  }) => Promise<unknown>,
  toolName: string,
  args: Record<string, unknown> = {}
) => {
  const request = createMockMCPRequest(toolName, args);
  return await toolHandler(request);
};

// Mock abort signal for testing cancellation
export const createMockAbortSignal = (aborted = false) => ({
  aborted,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
  onabort: null,
  reason: undefined,
  throwIfAborted: vi.fn().mockImplementation(() => {
    if (aborted) {
      throw new Error('Operation cancelled');
    }
  }),
});

// Helper to verify MCP server interactions
export const verifyMCPCalls = () => ({
  serverCreated: mockMCPServer !== null,
  handlersSet: mockMCPServer.setRequestHandler.mock.calls.length > 0,
  connectionsMade: mockMCPServer.connect.mock.calls.length > 0,
  listToolsHandlerCalls: mockMCPServer.setRequestHandler.mock.calls.filter(
    call => call[0] === mockListToolsMethod
  ),
  callToolHandlerCalls: mockMCPServer.setRequestHandler.mock.calls.filter(
    call => call[0] === mockCallToolMethod
  ),
});

// Reset MCP mocks
export const resetMCPMocks = () => {
  vi.clearAllMocks();
  mockMCPServer.setRequestHandler.mockClear();
  mockMCPServer.connect.mockClear();
};
