// The hosted copy of the record: README text quoted by Reception and shown in the folders. Local
// addresses (localhost, 127.0.0.1 and the like, with or without a port or path) and paths on Harry's
// machine become one neutral marker, so nothing quotes them. Only those spans change: no line is
// added, removed or moved, so every fact keeps its line, and every citation still lands on its line.

export const LOCAL_MARKER = '(local setup)';

const HOST = String.raw`(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])`;
// What can follow a host in a URL or a path: anything up to a space, a quote, a bracket or markup.
const REST = String.raw`[^\s<>"'\`()[\]*]*`;

/** A Markdown link or autolink to a local address: [text](http://127.0.0.1:4177) or <http://localhost:5173>. */
const MD_LINK = new RegExp(String.raw`\[([^\]\n]*)\]\(\s*(?:https?|wss?)://${HOST}${REST}\s*\)|<(?:https?|wss?)://${HOST}[^>\s]*>`, 'g');
/** A URL on a local host. */
const LOCAL_URL = new RegExp(String.raw`(?:https?|wss?)://${HOST}(?::\d+)?(?:[/?#]${REST})?`, 'g');
/** A local host with a port and no scheme: localhost:5173, 127.0.0.1:4318/mixed.html. */
const HOST_PORT = new RegExp(String.raw`(?<![\w.-])${HOST}:\d+(?:/${REST})?`, 'g');
/** The bare name, in prose: "plain http:// only for localhost". */
const HOST_WORD = new RegExp(String.raw`(?<![\w.-])${HOST}(?![\w:]|\.\w)`, 'g');
/** A path in Harry's home: ~/Personal/…, ~/Projects/…, /Users/<name>/…. */
const HOME_PATH = new RegExp(`~/(?:Personal|Projects)(?:/${REST})?|/Users/[A-Za-z0-9._-]+(?:/${REST})?`, 'g');

/** Sentence punctuation that ends a match belongs to the sentence, not the address. */
function keepTrailing(match: string): string {
  const trail = /[.,;:!?]+$/.exec(match)?.[0] ?? '';
  return LOCAL_MARKER + trail;
}

export interface Redaction {
  readonly text: string;
  /** How many spans were replaced. */
  readonly spans: number;
}

export function redactLocal(text: string): Redaction {
  let spans = 0;
  const count =
    (replace: (match: string, ...groups: string[]) => string) =>
    (match: string, ...groups: string[]): string => {
      spans++;
      return replace(match, ...groups);
    };
  const out = text
    // A link whose words are the address itself becomes the marker; other words stay, unlinked.
    .replace(
      MD_LINK,
      count((_match, words) => {
        if (words === undefined) return LOCAL_MARKER;
        const inner = words.replace(/^[*_`]+|[*_`]+$/g, '');
        return new RegExp(`^(?:(?:https?|wss?)://)?${HOST}`).test(inner) ? LOCAL_MARKER : words;
      }),
    )
    .replace(LOCAL_URL, count(keepTrailing))
    .replace(HOST_PORT, count(keepTrailing))
    .replace(HOME_PATH, count(keepTrailing))
    .replace(
      HOST_WORD,
      count(() => LOCAL_MARKER),
    );
  return { text: out, spans };
}

/** True when text still carries a local address or a home path (what the pre-deploy gate refuses). */
export function hasLocal(text: string): boolean {
  return [LOCAL_URL, HOST_PORT, HOST_WORD, HOME_PATH].some((re) => new RegExp(re.source).test(text));
}
