use serde::Serialize;
use tokio::sync::broadcast;
use tracing::debug;

/// Channel capacity for the global data-change event broadcast channel.
const CHANNEL_CAPACITY: usize = 256;

/// Represents a data change event emitted when entities are created, updated, or deleted.
///
/// The frontend uses these events (via an SSE stream) to invalidate TanStack Query caches
/// without polling.
#[derive(Debug, Clone, Serialize)]
pub struct DataChangeEvent {
    pub entity: String,
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
}

/// Global data-change event broadcaster.
///
/// Maintains a single broadcast channel that all SSE clients subscribe to.
/// When any API handler mutates a task or repo, it calls `emit_change` to
/// notify every connected frontend client.
///
/// This struct is cheaply cloneable (inner sender is an `Arc` internally).
#[derive(Clone)]
pub struct DataEventEmitter {
    sender: broadcast::Sender<DataChangeEvent>,
}

impl DataEventEmitter {
    /// Creates a new emitter with a broadcast channel of the default capacity.
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(CHANNEL_CAPACITY);
        Self { sender }
    }

    /// Returns a new receiver that will get all subsequent data-change events.
    pub fn subscribe(&self) -> broadcast::Receiver<DataChangeEvent> {
        self.sender.subscribe()
    }

    /// Broadcasts a data change event to all connected subscribers.
    ///
    /// If there are no active subscribers the event is silently dropped.
    pub fn emit_change(&self, entity: &str, action: &str, id: Option<&str>) {
        let event = DataChangeEvent {
            entity: entity.to_string(),
            action: action.to_string(),
            id: id.map(ToString::to_string),
        };

        let receiver_count = self.sender.receiver_count();
        if receiver_count == 0 {
            return;
        }

        debug!(
            entity,
            action,
            ?id,
            receivers = receiver_count,
            "Broadcasting data change event"
        );

        // Ignore send errors — they indicate all receivers have been dropped
        // between our check and the send, which is harmless.
        let _ = self.sender.send(event);
    }

    /// Returns the number of active subscribers.
    pub fn get_client_count(&self) -> usize {
        self.sender.receiver_count()
    }
}

impl Default for DataEventEmitter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn emit_change_delivers_to_subscriber() {
        let emitter = DataEventEmitter::new();
        let mut rx = emitter.subscribe();

        emitter.emit_change("task", "created", Some("abc-123"));

        let event = rx.recv().await.unwrap();
        assert_eq!(event.entity, "task");
        assert_eq!(event.action, "created");
        assert_eq!(event.id.as_deref(), Some("abc-123"));
    }

    #[tokio::test]
    async fn emit_change_without_id() {
        let emitter = DataEventEmitter::new();
        let mut rx = emitter.subscribe();

        emitter.emit_change("repo", "updated", None);

        let event = rx.recv().await.unwrap();
        assert_eq!(event.entity, "repo");
        assert_eq!(event.action, "updated");
        assert!(event.id.is_none());
    }

    #[test]
    fn serializes_without_id_when_none() {
        let event = DataChangeEvent {
            entity: "task".to_string(),
            action: "deleted".to_string(),
            id: None,
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(!json.contains("id"));
    }

    #[test]
    fn serializes_with_id_when_present() {
        let event = DataChangeEvent {
            entity: "task".to_string(),
            action: "created".to_string(),
            id: Some("xyz".to_string()),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains(r#""id":"xyz""#));
    }

    #[tokio::test]
    async fn emit_with_no_subscribers_does_not_panic() {
        let emitter = DataEventEmitter::new();
        // No subscribers — should not panic
        emitter.emit_change("task", "updated", Some("1"));
    }

    #[tokio::test]
    async fn get_client_count_tracks_subscribers() {
        let emitter = DataEventEmitter::new();
        assert_eq!(emitter.get_client_count(), 0);

        let _rx1 = emitter.subscribe();
        assert_eq!(emitter.get_client_count(), 1);

        let _rx2 = emitter.subscribe();
        assert_eq!(emitter.get_client_count(), 2);

        drop(_rx1);
        assert_eq!(emitter.get_client_count(), 1);
    }
}
