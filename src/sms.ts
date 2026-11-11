/**
 * Address that opens the phone's messaging app with the text filled in.
 * "sms:?&body=" is the form that works on both iOS and Android. No recipient
 * is given: the user picks one and presses Send in the messaging app.
 */
export function smsUrl(text: string): string {
  return `sms:?&body=${encodeURIComponent(text)}`;
}

/**
 * Opens the messaging app. Browsers may refuse to leave the page without a
 * tap on the screen, so the same address is also put on a visible link the
 * user can tap if nothing happens.
 */
export function openSms(text: string, fallbackLink: HTMLAnchorElement): void {
  const url = smsUrl(text);
  fallbackLink.href = url;
  fallbackLink.hidden = false;
  window.location.href = url;
}
