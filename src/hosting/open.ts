// On the public site, a tool that runs on Harry's machine (a local port in site.config.json) cannot be
// opened: its folder says so in place of the Open link, and the recorded loop keeps playing on its
// screen. Tools that open on this site, the two recorded terminal sessions, keep their link.

/** Plain text with no markup characters, so it goes into the HTML as it is. */
export const RECORDING_LINE = 'Runs on Harry’s machine; this is a recording of the real tool.';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

/** True for an absolute URL on a local host; a site path is not local-only. */
export function isLocalOnly(url: string): boolean {
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return false;
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** The folder's Open line in the hosted build, or null where the tool can be opened from here. */
export function hostedOpenLine(url: string): string | null {
  if (!isLocalOnly(url)) return null;
  // Same class as the Open line, so every rendering puts it where Open would be (under the screen).
  return `<p class="work__open work__open--recording"><span class="work__where">${RECORDING_LINE}</span></p>`;
}
