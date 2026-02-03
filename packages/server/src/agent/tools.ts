import type { Tool } from '../llm/types.js';

/**
 * Agent tools available for the AI to use during task execution.
 * Each tool is defined with its function name, description, and JSON Schema parameters.
 */
export const AGENT_TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read the contents of a file. Returns the file content as a string. Use this to understand existing code before making changes.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file from the workspace root',
          },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Create a new file or overwrite an existing file with the specified content. Use this to implement code changes.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file from the workspace root',
          },
          content: {
            type: 'string',
            description: 'The content to write to the file',
          },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description:
        'List files and folders in a directory. Returns a list of file and folder names. Use this to explore the codebase structure.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the directory from the workspace root. Use "." for the root directory.',
          },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description:
        'Execute a shell command. Only whitelisted commands are allowed (e.g., npm, yarn, git, ls, cat). Use this to run builds, tests, or explore the codebase.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The command to execute (e.g., "npm install", "npm test", "git status")',
          },
        },
        required: ['command'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description:
        'Search for a text pattern in files. Returns matching lines with file paths and line numbers. Use this to find relevant code.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Text or regex pattern to search for',
          },
          path: {
            type: 'string',
            description: 'Relative path to the directory to search in. Defaults to workspace root if not specified.',
          },
        },
        required: ['pattern'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'verify_server',
      description:
        'Starts a server command and verifies it starts successfully by monitoring output for success patterns. The server is automatically killed after verification. Use this instead of run_command for commands that start long-running servers (e.g., "npm start", "npm run dev"). Common success patterns: Node/Express: "Server running", "Listening on port"; Next.js: "Ready on", "started server on"; Vite: "Local:", "ready in"; Create React App: "Compiled successfully"; Python/Flask: "Running on http"; Python/Django: "Starting development server".',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The command to start the server (e.g., "npm start", "npm run dev")',
          },
          success_patterns: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Patterns to look for in output that indicate server started successfully (e.g., ["Server running", "Listening on port", "Ready on"])',
          },
          timeout_seconds: {
            type: 'number',
            description: 'Maximum seconds to wait for server to start (default: 30)',
          },
        },
        required: ['command', 'success_patterns'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'task_complete',
      description:
        'Signal that the task has been completed. Call this when you have finished implementing all the required changes and verified they work.',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'A summary of what was done, including files modified and key changes made',
          },
        },
        required: ['summary'],
        additionalProperties: false,
      },
    },
  },
];

/**
 * Get a tool by name.
 */
export function getToolByName(name: string): Tool | undefined {
  return AGENT_TOOLS.find((t) => t.function.name === name);
}

/**
 * Get all tool names.
 */
export function getToolNames(): string[] {
  return AGENT_TOOLS.map((t) => t.function.name);
}

export default AGENT_TOOLS;
