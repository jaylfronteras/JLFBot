// Exact app-owned browser state that belongs in an encrypted full backup.
// Never include cookies, authentication tokens, connection caches or unknown keys.
export const WORKSPACE_BACKUP_CLIENT_KEYS = [
  "jlfbot-drafts",
  "jlfbot-draft-attachments",
  "jlfbot-draft-send-ids",
  "jlfbot-draft-channel-modes",
  "jlfbot-skin",
  "jlfbot-show-threads",
  "jlfbot.sidebarDensity",
  "jlfbot.sidebarCollapsedSections.v1",
  "jlfbot.sidebarSectionOrder.v1",
  "jlfbot-analytics-opt-out",
  "jlfbot.remote-voice.v1",
] as const;

export type WorkspaceBackupClientState = Partial<Record<(typeof WORKSPACE_BACKUP_CLIENT_KEYS)[number], string>>;
