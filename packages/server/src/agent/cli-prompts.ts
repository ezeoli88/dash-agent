import type { Task } from '../services/task.service.js';
import type { Repository } from '../services/repo.service.js';

interface CLIPromptOptions {
  isResume?: boolean;
  reviewFeedback?: string;
  isEmptyRepo?: boolean;
  repository?: Repository | null;
  planOnly?: boolean;
  approvedPlan?: string;
  agentType?: string;
}

/**
 * Returns agent-specific execution instructions.
 * Some models (e.g. Codex) tend to create implementation plans before coding.
 * These instructions override that behavior to ensure direct execution.
 */
function buildAgentSpecificInstructions(agentType?: string): string {
  if (agentType === 'codex' || agentType === 'openrouter') {
    return `

## IMPORTANT — Direct Execution Required
- **DO NOT** create an implementation plan, outline, or strategy before coding
- **DO NOT** list the steps you will take or describe your approach
- **Start coding immediately** — read the relevant files and make changes right away
- Your output should be tool calls and code changes, not planning text`;
  }
  return '';
}

/**
 * Builds a single consolidated prompt for CLI agent execution.
 * CLI agents (Claude Code, Codex, etc.) receive one prompt via `-p` flag,
 * so we need to combine all context into a single comprehensive prompt.
 */
export function buildCLIPrompt(task: Task, options: CLIPromptOptions = {}): string {
  const { isResume, reviewFeedback, isEmptyRepo, repository, planOnly, approvedPlan, agentType } = options;

  // If implementing an approved plan, build implementation prompt
  if (approvedPlan) {
    return buildImplementationPrompt(task, approvedPlan, repository, agentType);
  }

  // If plan-only mode, build plan-only prompt (no anti-planning instructions here)
  if (planOnly) {
    return buildPlanOnlyPrompt(task, repository);
  }

  // If resuming with feedback, build a focused resume prompt
  if (isResume && reviewFeedback) {
    return buildResumePrompt(task, reviewFeedback, repository, agentType);
  }

  // If empty repo, build initialization prompt
  if (isEmptyRepo) {
    return buildEmptyRepoPrompt(task, repository, agentType);
  }

  // Normal task prompt
  return buildTaskPrompt(task, repository, agentType);
}

/**
 * Builds a section describing the repository context (stack, conventions, patterns).
 */
function buildRepositorySection(repository: Repository): string {
  const parts: string[] = [];
  parts.push(`## Repository Context`);
  parts.push(`**Repository:** ${repository.name}`);
  parts.push(`**Default branch:** ${repository.default_branch}`);

  const stack = repository.detected_stack;
  if (stack.framework || stack.state_management || stack.styling || stack.testing) {
    parts.push('');
    parts.push('### Detected Stack');
    if (stack.framework) parts.push(`- **Framework:** ${stack.framework}`);
    if (stack.state_management) parts.push(`- **State Management:** ${stack.state_management}`);
    if (stack.styling) parts.push(`- **Styling:** ${stack.styling}`);
    if (stack.testing) parts.push(`- **Testing:** ${stack.testing}`);
  }

  if (repository.conventions?.trim()) {
    parts.push('');
    parts.push('### Project Conventions');
    parts.push(repository.conventions);
  }

  if (repository.learned_patterns?.length > 0) {
    parts.push('');
    parts.push('### Learned Patterns');
    for (const lp of repository.learned_patterns) {
      parts.push(`- ${lp.pattern}`);
    }
  }

  return parts.join('\n');
}

/**
 * Builds the main task prompt that consolidates all context into a single
 * comprehensive prompt for CLI agent execution.
 */
function buildTaskPrompt(task: Task, repository?: Repository | null, agentType?: string): string {
  const spec = task.final_spec || task.generated_spec || task.description;

  const contextSection =
    task.context_files.length > 0
      ? `
## Context Files
Review these files before making any changes — they are directly relevant to your task:
${task.context_files.map((f) => `- ${f}`).join('\n')}
`
      : '';

  const repoSection = repository ? `\n${buildRepositorySection(repository)}\n` : '';
  const agentInstructions = buildAgentSpecificInstructions(agentType);

  return `You are an autonomous coding agent. Implement the following task in the current repository.

## Task
**Title:** ${task.title}

**Specification:**
${spec}
${repoSection}${contextSection}
## Workflow

1. **Explore** the codebase structure to understand the project layout and conventions
2. **Read** relevant files to understand existing patterns before making changes
3. **Implement** the changes step by step, following existing code style and conventions

## Guidelines
- Understand before changing: always read existing code before modifying it
- Follow existing patterns: match the coding style, naming conventions, and architecture
- Make minimal changes: only modify what is necessary for the task

## FORBIDDEN — Do NOT do any of the following
- **DO NOT** run tests, builds, linters, or any verification commands
- **DO NOT** start dev servers or any process that listens on a port
- **DO NOT** run \`npm run build\`, \`npm run test\`, \`npm run dev\`, or similar commands
- **DO NOT** run \`npx\`, \`node\`, or any script that executes project code
- **DO NOT** use git commands (git add, git commit, git checkout, git switch, git branch, git push, etc.) — the system manages version control automatically
- Your job is ONLY to write code — verification and version control will be done separately${agentInstructions}`.trim();
}

/**
 * Builds a resume prompt for when the agent needs to address reviewer feedback
 * on a previously submitted task.
 */
function buildResumePrompt(task: Task, feedback: string, repository?: Repository | null, agentType?: string): string {
  const spec = task.final_spec || task.generated_spec || task.description;
  const repoSection = repository ? `\n${buildRepositorySection(repository)}\n` : '';
  const agentInstructions = buildAgentSpecificInstructions(agentType);

  return `You are an autonomous coding agent. You previously worked on a task that received reviewer feedback. Address the feedback and complete the task.

## Task Context
**Title:** ${task.title}

**Original Specification:**
${spec}
${repoSection}
## Reviewer Feedback
The reviewer has requested the following changes:

${feedback}

## Workflow

1. **Review** the current state of your previous changes in the working tree
2. **Understand** exactly what the reviewer is asking for
3. **Implement** the necessary modifications to address the feedback

## Guidelines
- Focus specifically on addressing the reviewer's feedback
- Make minimal additional changes beyond what is requested

## FORBIDDEN — Do NOT do any of the following
- **DO NOT** run tests, builds, linters, or any verification commands
- **DO NOT** start dev servers or any process that listens on a port
- **DO NOT** run \`npm run build\`, \`npm run test\`, \`npm run dev\`, or similar commands
- **DO NOT** run \`npx\`, \`node\`, or any script that executes project code
- **DO NOT** use git commands (git add, git commit, git checkout, git switch, git branch, git push, etc.) — the system manages version control automatically
- Your job is ONLY to write code — verification and version control will be done separately${agentInstructions}`.trim();
}

/**
 * Builds a prompt for initializing an empty repository from scratch
 * based on the task requirements.
 */
function buildEmptyRepoPrompt(task: Task, repository?: Repository | null, agentType?: string): string {
  const spec = task.final_spec || task.generated_spec || task.description;
  const repoSection = repository ? `\n${buildRepositorySection(repository)}\n` : '';
  const agentInstructions = buildAgentSpecificInstructions(agentType);

  return `You are an autonomous coding agent. This repository is completely empty — there are no files or commits yet. Your task is to create the initial project from scratch.

## Task
**Title:** ${task.title}

**Specification:**
${spec}
${repoSection}
## Workflow

1. **Analyze** the requirements from the specification to determine the appropriate project type and tech stack
2. **Create the project structure** including:
   - Configuration files (package.json, tsconfig.json, etc. as appropriate)
   - A .gitignore file with sensible defaults
   - Source code directories and initial files
3. **Implement** the requested functionality as described in the specification

## Guidelines
- Start with the most fundamental files first (package.json or equivalent)
- Create directories before creating files within them
- All files should have proper content, not just placeholders
- Follow best practices for the chosen technology stack

## FORBIDDEN — Do NOT do any of the following
- **DO NOT** run tests, builds, linters, or any verification commands
- **DO NOT** start dev servers or any process that listens on a port
- **DO NOT** run \`npm run build\`, \`npm run test\`, \`npm run dev\`, or similar commands
- **DO NOT** run \`npx\`, \`node\`, or any script that executes project code
- **DO NOT** use git commands (git add, git commit, git checkout, git switch, git branch, git push, etc.) — the system manages version control automatically
- Your job is ONLY to write code — verification and version control will be done separately${agentInstructions}`.trim();
}

/**
 * Builds a plan-only prompt that instructs the agent to explore the codebase
 * and create a detailed implementation plan WITHOUT making any file changes.
 */
function buildPlanOnlyPrompt(task: Task, repository?: Repository | null): string {
  const spec = task.final_spec || task.generated_spec || task.description;

  const contextSection =
    task.context_files.length > 0
      ? `
## Context Files
Review these files — they are directly relevant to your task:
${task.context_files.map((f) => `- ${f}`).join('\n')}
`
      : '';

  const repoSection = repository ? `\n${buildRepositorySection(repository)}\n` : '';

  return `You are an autonomous coding agent in PLAN-ONLY mode. Your job is to explore the codebase and create a detailed implementation plan for the following task. You must NOT make any changes to files — only read and analyze.

## Task
**Title:** ${task.title}

**Specification:**
${spec}
${repoSection}${contextSection}
## Your Mission

Create a comprehensive, step-by-step implementation plan. You should:

1. **Explore** the codebase structure to understand the project layout, architecture, and conventions
2. **Read** relevant files to understand existing patterns, dependencies, and integration points
3. **Analyze** what needs to change and identify potential risks or edge cases
4. **Output a detailed plan** that includes:
   - Which files need to be created, modified, or deleted
   - The exact changes needed in each file (describe the code changes clearly)
   - The order of changes and dependencies between them
   - Key design decisions and their rationale
   - Any potential risks or things to watch out for

## CRITICAL RULES
- **DO NOT** create, edit, write, or modify any files
- **DO NOT** run any commands that modify the filesystem
- **ONLY** use read-only operations: reading files, searching code, listing directories
- Your output IS the plan — write it clearly so a developer can follow it step by step
- Be specific: include file paths, function names, and describe the actual code changes needed`.trim();
}

/**
 * Builds an implementation prompt that tells the agent to execute
 * a previously approved plan step by step.
 */
function buildImplementationPrompt(task: Task, plan: string, repository?: Repository | null, agentType?: string): string {
  const spec = task.final_spec || task.generated_spec || task.description;

  const repoSection = repository ? `\n${buildRepositorySection(repository)}\n` : '';
  const agentInstructions = buildAgentSpecificInstructions(agentType);

  return `You are an autonomous coding agent. You have a previously approved implementation plan. Your job is to implement it step by step.

## Task
**Title:** ${task.title}

**Specification:**
${spec}
${repoSection}
## Approved Implementation Plan

The following plan has been reviewed and approved by the user. Follow it closely:

${plan}

## Workflow

1. **Follow the plan** — implement each step in the order specified

## Guidelines
- Follow the approved plan closely — it has been reviewed and approved
- If you encounter unexpected issues not covered by the plan, use your best judgment
- Follow existing code style and conventions
- Make minimal changes beyond what the plan specifies

## FORBIDDEN — Do NOT do any of the following
- **DO NOT** run tests, builds, linters, or any verification commands
- **DO NOT** start dev servers or any process that listens on a port
- **DO NOT** run \`npm run build\`, \`npm run test\`, \`npm run dev\`, or similar commands
- **DO NOT** run \`npx\`, \`node\`, or any script that executes project code
- **DO NOT** use git commands (git add, git commit, git checkout, git switch, git branch, git push, etc.) — the system manages version control automatically
- Your job is ONLY to write code — verification and version control will be done separately${agentInstructions}`.trim();
}

export default {
  buildCLIPrompt,
};
