//! Repository service providing local-path helpers.
//!
//! Port of `packages/server/src/services/repo.service.ts` (local-path subset).
//!
//! The main CRUD for repositories is handled by the DB-backed route handlers.
//! This module adds convenience methods for determining local filesystem paths
//! from repository records.

use std::path::PathBuf;

use crate::models::repository::Repository;

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/// Returns `true` if the repository URL is a local `file://` URL.
pub fn is_local_repo(repo: &Repository) -> bool {
    repo.url.starts_with("file://") || repo.url.starts_with("file:\\\\")
}

/// Returns the local filesystem path for a `file://` repository URL.
///
/// Returns `None` if the repository is not a local repo or the path does not
/// exist on disk.
pub fn get_repo_local_path(repo: &Repository) -> Option<PathBuf> {
    if !is_local_repo(repo) {
        return None;
    }

    let raw_path = repo
        .url
        .trim_start_matches("file://")
        .trim_start_matches("file:\\\\");

    let path = PathBuf::from(raw_path);
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

/// Extracts the `owner/repo` pair from a GitHub or GitLab URL.
///
/// Returns `None` if the URL does not match the expected pattern.
pub fn parse_owner_repo(url: &str) -> Option<(String, String)> {
    // Try GitHub/GitLab HTTPS pattern
    let re =
        regex_lite::Regex::new(r"(?:github|gitlab)\.com[/:]([^/]+)/([^/\s.]+)").unwrap();
    if let Some(caps) = re.captures(url) {
        if let (Some(owner_m), Some(repo_m)) = (caps.get(1), caps.get(2)) {
            let owner = owner_m.as_str().to_string();
            let repo = repo_m.as_str().trim_end_matches(".git").to_string();
            return Some((owner, repo));
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_owner_repo_github_https() {
        let result = parse_owner_repo("https://github.com/ezeoli88/dash-agent");
        assert_eq!(
            result,
            Some(("ezeoli88".into(), "dash-agent".into()))
        );
    }

    #[test]
    fn test_parse_owner_repo_gitlab_https() {
        let result = parse_owner_repo("https://gitlab.com/user/project.git");
        assert_eq!(
            result,
            Some(("user".into(), "project".into()))
        );
    }

    #[test]
    fn test_parse_owner_repo_invalid() {
        assert!(parse_owner_repo("https://example.com/foo/bar").is_none());
    }

    #[test]
    fn test_is_local_repo() {
        let repo = Repository {
            id: String::new(),
            name: "test".into(),
            url: "file:///home/user/repo".into(),
            default_branch: "main".into(),
            detected_stack: Default::default(),
            conventions: String::new(),
            learned_patterns: Vec::new(),
            active_tasks_count: 0,
            created_at: String::new(),
            updated_at: String::new(),
        };
        assert!(is_local_repo(&repo));
    }
}
