interface ImportMetaEnv {
  /** Slack incoming webhook. Empty or missing: the send pose opens an SMS instead. */
  readonly VITE_SLACK_WEBHOOK_URL?: string;
}
