// Re-export types from shared package
export type {
  DetectedStack,
  LearnedPattern,
  Repository,
  CreateRepositoryInput,
  UpdateRepositoryInput,
  GitHubRepository,
  GitHubReposResponse,
  StackDetectionResponse,
  ClearPatternsResponse,
  AddPatternRequest,
  AddPatternResponse,
  DeletePatternResponse,
} from '@dash-agent/shared';

// Frontend-specific types

/**
 * State for the add repo dialog
 */
export type AddRepoDialogState = 'closed' | 'selecting' | 'adding';

/**
 * Selected repo source
 */
export type RepoSource = 'github' | 'url';

/**
 * Repo card actions
 */
export type RepoCardAction = 'configure' | 'delete';
