import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
  ChatCompletionAssistantMessageParam,
} from 'openai/resources/chat/completions';
import { getConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import type { LLMProvider, Message, Tool, ChatOptions, ToolCall } from './types.js';

const logger = createLogger('openai-provider');

/**
 * Default model to use for chat completions.
 */
const DEFAULT_MODEL = 'gpt-4o';

/**
 * Maximum tokens for response by default.
 */
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Request timeout in milliseconds (2 minutes).
 */
const REQUEST_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * OpenAI implementation of the LLM provider interface.
 * Uses the OpenAI SDK to interact with GPT models.
 */
export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    const config = getConfig();
    const key = apiKey ?? config.openaiApiKey;

    if (!key) {
      throw new Error('OpenAI API key is required. Set OPENAI_API_KEY in environment.');
    }

    this.client = new OpenAI({
      apiKey: key,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: 2,
    });
    this.model = model ?? DEFAULT_MODEL;

    logger.info('OpenAI provider initialized', { model: this.model });
  }

  /**
   * Converts our internal Message format to OpenAI's format.
   */
  private toOpenAIMessage(message: Message): ChatCompletionMessageParam {
    switch (message.role) {
      case 'system':
        return {
          role: 'system',
          content: message.content ?? '',
        };

      case 'user':
        return {
          role: 'user',
          content: message.content ?? '',
        };

      case 'assistant': {
        const assistantMessage: ChatCompletionAssistantMessageParam = {
          role: 'assistant',
          content: message.content,
        };

        if (message.tool_calls && message.tool_calls.length > 0) {
          assistantMessage.tool_calls = message.tool_calls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          }));
        }

        return assistantMessage;
      }

      case 'tool': {
        const toolMessage: ChatCompletionToolMessageParam = {
          role: 'tool',
          content: message.content ?? '',
          tool_call_id: message.tool_call_id ?? '',
        };
        return toolMessage;
      }

      default:
        throw new Error(`Unknown message role: ${message.role}`);
    }
  }

  /**
   * Converts our Tool format to OpenAI's format.
   */
  private toOpenAITool(tool: Tool): ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters as Record<string, unknown>,
      },
    };
  }

  /**
   * Converts OpenAI's response to our internal Message format.
   */
  private fromOpenAIMessage(choice: OpenAI.Chat.Completions.ChatCompletion.Choice): Message {
    const assistantMessage = choice.message;

    const message: Message = {
      role: 'assistant',
      content: assistantMessage.content,
    };

    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      message.tool_calls = assistantMessage.tool_calls
        .filter((tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & { type: 'function' } =>
          tc.type === 'function'
        )
        .map((tc): ToolCall => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        }));
    }

    return message;
  }

  /**
   * Sends a chat request to OpenAI with optional tool support.
   */
  async chat(messages: Message[], tools?: Tool[], options?: ChatOptions): Promise<Message> {
    const openAIMessages = messages.map((m) => this.toOpenAIMessage(m));

    const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: this.model,
      messages: openAIMessages,
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options?.temperature ?? 0.7,
    };

    // Add tools if provided
    if (tools && tools.length > 0) {
      requestParams.tools = tools.map((t) => this.toOpenAITool(t));
      requestParams.tool_choice = 'auto';
    }

    logger.debug('Sending chat request to OpenAI', {
      model: this.model,
      messageCount: messages.length,
      toolCount: tools?.length ?? 0,
    });

    try {
      const completion = await this.client.chat.completions.create(requestParams);

      const choice = completion.choices[0];
      if (!choice) {
        throw new Error('No response choice returned from OpenAI');
      }

      const responseMessage = this.fromOpenAIMessage(choice);

      logger.debug('Received response from OpenAI', {
        finishReason: choice.finish_reason,
        hasToolCalls: !!responseMessage.tool_calls?.length,
        toolCallCount: responseMessage.tool_calls?.length ?? 0,
        usage: completion.usage,
      });

      return responseMessage;
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        logger.error('OpenAI API error', {
          status: error.status,
          message: error.message,
          code: error.code,
        });
        throw new Error(`OpenAI API error: ${error.message}`);
      }
      throw error;
    }
  }
}

/**
 * Creates a new OpenAI provider instance.
 */
export function createOpenAIProvider(apiKey?: string, model?: string): LLMProvider {
  return new OpenAIProvider(apiKey, model);
}

export default OpenAIProvider;
