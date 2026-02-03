/**
 * LLM abstraction layer for the agent.
 * Provides a unified interface for interacting with different LLM providers.
 */

export type {
  Message,
  MessageRole,
  Tool,
  ToolCall,
  ToolFunction,
  FunctionCall,
  LLMProvider,
  ChatOptions,
} from './types.js';

export { OpenAIProvider, createOpenAIProvider } from './openai.js';
