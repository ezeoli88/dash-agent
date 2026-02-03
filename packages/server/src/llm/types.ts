/**
 * Message roles supported by the LLM API.
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * A function call made by the assistant.
 */
export interface FunctionCall {
  /** The name of the function to call */
  name: string;
  /** JSON-encoded arguments for the function */
  arguments: string;
}

/**
 * A tool call made by the assistant.
 */
export interface ToolCall {
  /** Unique identifier for this tool call */
  id: string;
  /** Type of tool (currently only 'function' is supported) */
  type: 'function';
  /** The function to call */
  function: FunctionCall;
}

/**
 * A message in the conversation.
 */
export interface Message {
  /** The role of the message author */
  role: MessageRole;
  /** The content of the message */
  content: string | null;
  /** Tool calls made by the assistant (only present for assistant messages) */
  tool_calls?: ToolCall[];
  /** The ID of the tool call this message is responding to (only for tool messages) */
  tool_call_id?: string;
}

/**
 * Definition of a tool's function.
 */
export interface ToolFunction {
  /** The name of the function */
  name: string;
  /** A description of what the function does */
  description: string;
  /** JSON Schema describing the function parameters */
  parameters: Record<string, unknown>;
}

/**
 * A tool that can be used by the LLM.
 */
export interface Tool {
  /** Type of tool (currently only 'function' is supported) */
  type: 'function';
  /** The function definition */
  function: ToolFunction;
}

/**
 * Options for the LLM chat request.
 */
export interface ChatOptions {
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for sampling (0-2) */
  temperature?: number;
}

/**
 * Interface for LLM providers.
 * Implementations should handle API calls and convert responses to our Message format.
 */
export interface LLMProvider {
  /**
   * Sends a chat request to the LLM with optional tool support.
   *
   * @param messages - The conversation history
   * @param tools - Available tools for the LLM to use
   * @param options - Additional options for the request
   * @returns The assistant's response message
   */
  chat(messages: Message[], tools?: Tool[], options?: ChatOptions): Promise<Message>;
}
