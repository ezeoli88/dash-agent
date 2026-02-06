import { getDatabase, saveDatabase } from '../db/database.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('settings-service');

/**
 * Known setting keys for type safety.
 */
export type SettingKey = 'default_agent_type' | 'default_agent_model';

/**
 * Service for managing application settings.
 * Uses the user_settings table (created in migration 6).
 */
class SettingsService {
  /**
   * Gets a setting value by key.
   * Returns null if the setting doesn't exist.
   */
  getSetting(key: SettingKey): string | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT value FROM user_settings WHERE key = ?');
    stmt.bind([key]);

    if (!stmt.step()) {
      stmt.free();
      return null;
    }

    const values = stmt.get();
    stmt.free();

    return (values?.[0] as string) ?? null;
  }

  /**
   * Sets a setting value. Creates or updates the setting.
   */
  setSetting(key: SettingKey, value: string): void {
    const db = getDatabase();
    const now = new Date().toISOString();

    // Use INSERT OR REPLACE (upsert)
    db.run(
      'INSERT OR REPLACE INTO user_settings (key, value, updated_at) VALUES (?, ?, ?)',
      [key, value, now]
    );

    saveDatabase();
    logger.info('Setting updated', { key, value });
  }

  /**
   * Deletes a setting by key.
   */
  deleteSetting(key: SettingKey): void {
    const db = getDatabase();
    db.run('DELETE FROM user_settings WHERE key = ?', [key]);
    saveDatabase();
    logger.info('Setting deleted', { key });
  }

  /**
   * Gets all settings as a key-value record.
   */
  getAllSettings(): Record<string, string> {
    const db = getDatabase();
    const result = db.exec('SELECT key, value FROM user_settings');

    if (result.length === 0 || !result[0]) {
      return {};
    }

    const settings: Record<string, string> = {};
    for (const row of result[0].values) {
      const key = row[0] as string;
      const value = row[1] as string;
      settings[key] = value;
    }

    return settings;
  }

  /**
   * Gets the default agent configuration.
   * Returns null values if not configured.
   */
  getDefaultAgent(): { agentType: string | null; agentModel: string | null } {
    return {
      agentType: this.getSetting('default_agent_type'),
      agentModel: this.getSetting('default_agent_model'),
    };
  }

  /**
   * Sets the default agent configuration.
   */
  setDefaultAgent(agentType: string, agentModel?: string): void {
    this.setSetting('default_agent_type', agentType);
    if (agentModel) {
      this.setSetting('default_agent_model', agentModel);
    }
  }
}

/** Singleton instance */
export const settingsService = new SettingsService();

export default settingsService;
