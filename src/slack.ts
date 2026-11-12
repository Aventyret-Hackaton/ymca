/**
 * Posts the message to a Slack channel through an incoming webhook, so it is
 * sent without touching the screen.
 *
 * The webhook address comes from VITE_SLACK_WEBHOOK_URL at build time: in
 * .env.local when running locally, and in the repo secret SLACK_WEBHOOK_URL
 * for GitHub Pages. It ends up in the published JavaScript, so anyone who
 * looks can post to the channel. Use a channel made for the demo and remove
 * the webhook in Slack afterwards.
 */
const WEBHOOK_URL: string = import.meta.env.VITE_SLACK_WEBHOOK_URL ?? "";

export const isSlackConfigured = WEBHOOK_URL !== "";

/**
 * Sends the text, with an optional note such as the calorie count. Slack does
 * not allow ordinary requests from web pages, so this is sent as a form post
 * in "no-cors" mode. The browser then cannot read
 * Slack's answer: a resolved promise means the request went out, not that
 * Slack accepted it. A rejected promise means it never left (e.g. offline).
 */
export async function postToSlack(text: string, note = ""): Promise<void> {
  // The note goes on its own line in italics, under the message.
  const payload = JSON.stringify({ text: note ? `🕺 ${text}\n_${note}_` : `🕺 ${text}` });
  await fetch(WEBHOOK_URL, {
    method: "POST",
    mode: "no-cors",
    body: new URLSearchParams({ payload }),
  });
}
