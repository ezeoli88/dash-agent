import type { Task } from '../services/task.service.js';

interface CLIPromptOptions {
  isResume?: boolean;
  reviewFeedback?: string;
  isEmptyRepo?: boolean;
}

/**
 * Builds a single consolidated prompt for CLI agent execution.
 * CLI agents (Claude Code, Codex, etc.) receive one prompt via `-p` flag,
 * so we need to combine all context into a single comprehensive prompt.
 */
export function buildCLIPrompt(task: Task, options: CLIPromptOptions = {}): string {
  const { isResume, reviewFeedback, isEmptyRepo } = options;

  // If resuming with feedback, build a focused resume prompt
  if (isResume && reviewFeedback) {
    return buildResumePrompt(task, reviewFeedback);
  }

  // If empty repo, build initialization prompt
  if (isEmptyRepo) {
    return buildEmptyRepoPrompt(task);
  }

  // Normal task prompt
  return buildTaskPrompt(task);
}

/**
 * Builds the main task prompt that consolidates all context into a single
 * comprehensive prompt for CLI agent execution.
 */
function buildTaskPrompt(task: Task): string {
  const spec = task.final_spec || task.generated_spec || task.description;

  const contextSection =
    task.context_files.length > 0
      ? `
## Context Files
Review these files before making any changes — they are directly relevant to your task:
${task.context_files.map((f) => `- ${f}`).join('\n')}
`
      : '';

  const buildSection = task.build_command
    ? `
## Build Verification
After implementing your changes, run this command to verify everything works:
\`\`\`
${task.build_command}
\`\`\`
`
    : '';

  const branchSection = task.target_branch
    ? `
## Branch
Work on branch: \`${task.target_branch}\`
`
    : '';

  return `You are an autonomous coding agent. Implement the following task in the current repository.

## Task
**Title:** ${task.title}

**Specification:**
${spec}
${branchSection}${contextSection}${buildSection}
## Workflow

1. **Explore** the codebase structure to understand the project layout and conventions
2. **Read** relevant files to understand existing patterns before making changes
3. **Plan** your implementation approach — identify files to create or modify
4. **Implement** the changes step by step, following existing code style and conventions
5. **Verify** your work by running tests or the build command if available
6. **Commit** your changes with a clear, descriptive commit message

## Guidelines
- Understand before changing: always read existing code before modifying it
- Follow existing patterns: match the coding style, naming conventions, and architecture
- Make minimal changes: only modify what is necessary for the task
- Test your changes: run tests or builds if available to verify your work
- Write clean commits: use clear, descriptive commit messages`.trim();
}

/**
 * Builds a resume prompt for when the agent needs to address reviewer feedback
 * on a previously submitted task.
 */
function buildResumePrompt(task: Task, feedback: string): string {
  const spec = task.final_spec || task.generated_spec || task.description;

  return `You are an autonomous coding agent. You previously worked on a task that received reviewer feedback. Address the feedback and complete the task.

## Task Context
**Title:** ${task.title}

**Original Specification:**
${spec}

## Reviewer Feedback
The reviewer has requested the following changes:

${feedback}

## Workflow

1. **Review** the current state of your previous changes in the working tree
2. **Understand** exactly what the reviewer is asking for
3. **Implement** the necessary modifications to address the feedback
4. **Verify** your changes work correctly — run tests or the build command if available
5. **Commit** your changes with a clear message referencing the feedback

## Guidelines
- Focus specifically on addressing the reviewer's feedback
- Make minimal additional changes beyond what is requested
- Test your changes before completing
- Write a clear commit message describing what you changed to address the feedback`.trim();
}

/**
 * Builds a prompt for initializing an empty repository from scratch
 * based on the task requirements.
 */
function buildEmptyRepoPrompt(task: Task): string {
  const spec = task.final_spec || task.generated_spec || task.description;

  const buildSection = task.build_command
    ? `
## Build Command
Once the project is set up, verify it works with:
\`\`\`
${task.build_command}
\`\`\`
`
    : '';

  return `You are an autonomous coding agent. This repository is completely empty — there are no files or commits yet. Your task is to create the initial project from scratch.

## Task
**Title:** ${task.title}

**Specification:**
${spec}
${buildSection}
## Workflow

1. **Analyze** the requirements from the specification to determine the appropriate project type and tech stack
2. **Create the project structure** including:
   - A README.md file explaining the project
   - Configuration files (package.json, tsconfig.json, etc. as appropriate)
   - A .gitignore file with sensible defaults
   - Source code directories and initial files
3. **Implement** the requested functionality as described in the specification
4. **Verify** the project builds and runs correctly
5. **Commit** all files with a clear initial commit message

## Guidelines
- Start with the most fundamental files first (README.md, package.json or equivalent)
- Create directories before creating files within them
- All files should have proper content, not just placeholders
- The project should be ready to run after you complete your work
- Follow best practices for the chosen technology stack`.trim();
}

export default {
  buildCLIPrompt,
};
