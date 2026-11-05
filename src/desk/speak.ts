// "Speak to me": the microphone on the desk says hello in a speech bubble. Click only, and it never
// listens: no microphone is asked for, no permission, no audio. Clicking the mic (or Enter on it) lights
// its ON AIR lamp and pops a bubble out of it, into empty desk space, never over another thing on the
// desk: "Say hello", Harry's email on one line, and three chips: Copy email (Copied ✓ once the clipboard
// has it, for two seconds), LinkedIn and CV. A labelled dialog: focus goes to Copy email and back to the
// mic on close; Esc or a click on the desk closes it, and the lamp goes off.

type Rect = { x: number; y: number; width: number; height: number };

interface SpeakOptions {
  readonly trigger: HTMLElement;
  readonly card: HTMLElement;
  readonly hall: HTMLElement;
  readonly onAir: (on: boolean) => void;
  /** The top of the mic's head on screen, where the bubble's tail points. */
  readonly head: () => { x: number; y: number } | null;
  /** Everything on the desk the bubble must keep clear of, on screen. */
  readonly avoid: () => Rect[];
  readonly reduced: boolean;
}

const hit = (a: Rect, b: Rect, pad = 8) =>
  a.x < b.x + b.width + pad && b.x < a.x + a.width + pad && a.y < b.y + b.height + pad && b.y < a.y + a.height + pad;
const area = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/** A cartoon speech bubble: a rounded box with a wedge from its nearest side to the tip. */
function bubblePath(w: number, h: number, r: number, tip: { x: number; y: number }): string {
  const cx = Math.min(Math.max(tip.x, r + 18), w - r - 18);
  const cy = Math.min(Math.max(tip.y, r + 18), h - r - 18);
  // The side the tip is beyond, by how far beyond it is.
  const beyond = { top: -tip.y, bottom: tip.y - h, left: -tip.x, right: tip.x - w };
  const side = (Object.entries(beyond) as Array<[keyof typeof beyond, number]>).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'bottom';
  const half = 14;
  const t = `${tip.x.toFixed(1)} ${tip.y.toFixed(1)}`;
  const d: string[] = [`M ${r} 0`];
  if (side === 'top') d.push(`L ${cx - half} 0 L ${t} L ${cx + half} 0`);
  d.push(`L ${w - r} 0 Q ${w} 0 ${w} ${r}`);
  if (side === 'right') d.push(`L ${w} ${cy - half} L ${t} L ${w} ${cy + half}`);
  d.push(`L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h}`);
  if (side === 'bottom') d.push(`L ${cx + half} ${h} L ${t} L ${cx - half} ${h}`);
  d.push(`L ${r} ${h} Q 0 ${h} 0 ${h - r}`);
  if (side === 'left') d.push(`L 0 ${cy + half} L ${t} L 0 ${cy - half}`);
  d.push(`L 0 ${r} Q 0 0 ${r} 0 Z`);
  return d.join(' ');
}

export function speakCard({ trigger, card, hall, onAir, head, avoid, reduced }: SpeakOptions): { toggle(): void } {
  const copy = card.querySelector<HTMLButtonElement>('#speak-copy');
  const said = card.querySelector<HTMLElement>('#speak-copied');
  const email = card.querySelector<HTMLElement>('#speak-email');
  const shape = card.querySelector<SVGSVGElement>('.speak__shape');
  const outline = card.querySelector<SVGPathElement>('.speak__outline');
  const isOpen = () => card.dataset.open === 'true';
  let restore: ReturnType<typeof setTimeout> | undefined;

  /** The email on one line: its line's type shrinks until it fits the bubble. */
  const fitEmail = () => {
    const line = email?.parentElement;
    if (!line) return;
    line.style.fontSize = '';
    let size = Number.parseFloat(getComputedStyle(line).fontSize);
    while (line.scrollWidth > line.clientWidth + 0.5 && size > 10) {
      size -= 0.5;
      line.style.fontSize = `${size}px`;
    }
  };

  /**
   * Into the first empty spot around the mic's head, inside the room and clear of every thing on the desk:
   * at full width if there is room, narrower (the chips wrapping, the email's type shrinking to stay on one
   * line) where the space is tighter.
   */
  const place = () => {
    const h = hall.getBoundingClientRect();
    const at = head() ?? { x: h.left + h.width / 2, y: h.top + h.height / 2 };
    const index = document.querySelector('.index')?.getBoundingClientRect();
    const floor = Math.min(h.bottom, index?.top ?? h.bottom) - 12;
    const things = avoid();
    let chosen: { x: number; y: number; width: number; cost: number } | null = null;
    const tried: string[] = [];
    for (const width of [330, 290, 250, 220]) {
      card.style.width = `${width}px`;
      fitEmail();
      const spot = bestSpot(h, at, floor, things);
      tried.push(`${width}:${Math.round(spot.cost)}@${Math.round(spot.x)},${Math.round(spot.y)}x${card.offsetHeight}`);
      if (!chosen || spot.cost < chosen.cost) chosen = { ...spot, width };
      if (spot.cost === 0) break;
    }
    if (!chosen) return;
    // What was tried, for the checks and for anyone looking: width:cost@x,y×height.
    card.dataset.tried = tried.join(' ');
    card.style.width = `${chosen.width}px`;
    fitEmail();
    draw(h, at, chosen);
  };
  /** The least-covered spot around the head, for the bubble at its current size. */
  const bestSpot = (h: DOMRect, at: { x: number; y: number }, floor: number, things: Rect[]) => {
    const w = card.offsetWidth;
    const ht = card.offsetHeight;
    const gap = 26;
    // Left of the mic first (the empty corner of the desk), then above it, then right; at the head's height,
    // centred on it, or flush with the top.
    const xs = [at.x - w - gap * 0.6, at.x - w - gap * 2.4, at.x - w / 2, at.x + gap * 0.6, at.x + gap * 1.4];
    const ys = [at.y - ht - gap * 0.4, at.y - ht / 2, h.top + 12, at.y + gap * 3];
    const spots = xs.flatMap((x) => ys.map((y) => ({ x, y })));
    let best = spots[0] ?? { x: 0, y: 0 };
    let bestCost = Number.POSITIVE_INFINITY;
    for (const spot of spots) {
      // Slid inside the room rather than thrown away when it runs over an edge.
      const s = {
        x: Math.min(Math.max(spot.x, h.left + 12), h.right - 12 - w),
        y: Math.min(Math.max(spot.y, h.top + 12), floor - ht),
      };
      const box = { x: s.x, y: s.y, width: w, height: ht };
      const outside = s.x < h.left + 12 || s.y < h.top + 12;
      const cost = (outside ? 1e9 : 0) + things.reduce((sum, t) => sum + (hit(box, t) ? 1e5 + area(box, t) : 0), 0);
      if (cost < bestCost) {
        bestCost = cost;
        best = s;
      }
      if (cost === 0) break;
    }
    return { ...best, cost: bestCost };
  };
  /** The bubble at its spot, and its outline with the tail drawn to the mic's head. */
  const draw = (h: DOMRect, at: { x: number; y: number }, best: { x: number; y: number }) => {
    const w = card.offsetWidth;
    const ht = card.offsetHeight;
    card.style.transform = `translate(${(best.x - h.left).toFixed(1)}px, ${(best.y - h.top).toFixed(1)}px)`;
    // The tail, from the nearest side to just short of the mic's head.
    const tip = { x: at.x - best.x, y: at.y - best.y };
    const len = Math.hypot(tip.x - w / 2, tip.y - ht / 2);
    const short = Math.max(0, (len - 10) / len);
    const end = { x: w / 2 + (tip.x - w / 2) * short, y: ht / 2 + (tip.y - ht / 2) * short };
    if (shape && outline) {
      shape.setAttribute('viewBox', `0 0 ${w} ${ht}`);
      shape.setAttribute('width', String(w));
      shape.setAttribute('height', String(ht));
      outline.setAttribute('d', bubblePath(w, ht, 18, end));
    }
    card.style.setProperty('--tail-x', `${end.x.toFixed(0)}px`);
    card.style.setProperty('--tail-y', `${end.y.toFixed(0)}px`);
  };
  const open = () => {
    card.dataset.open = 'true';
    trigger.setAttribute('aria-expanded', 'true');
    if (said) said.textContent = '';
    if (copy) copy.textContent = 'Copy email';
    onAir(true);
    place();
    if (!reduced) {
      delete card.dataset.popped;
      void card.offsetWidth;
      card.dataset.popped = '';
    }
    copy?.focus();
  };
  const close = (returnFocus: boolean) => {
    if (!isOpen()) return;
    delete card.dataset.open;
    trigger.setAttribute('aria-expanded', 'false');
    onAir(false);
    clearTimeout(restore);
    if (returnFocus) trigger.focus();
  };
  const toggle = () => (isOpen() ? close(true) : open());

  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    toggle();
  });
  // Esc closes the bubble wherever focus is (Safari leaves it on the page after a click), before the
  // desk's own Esc, which would step back a place, ever hears it.
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !isOpen()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close(true);
    },
    true,
  );
  document.addEventListener('pointerdown', (event) => {
    const target = event.target as Node | null;
    if (isOpen() && target && !card.contains(target) && !trigger.contains(target)) close(false);
  });
  copy?.addEventListener('click', () => {
    const address = email?.textContent?.trim() ?? '';
    const feedback = (chip: string, line: string) => {
      if (copy) copy.textContent = chip;
      if (said) said.textContent = line;
      clearTimeout(restore);
      restore = setTimeout(() => {
        if (copy) copy.textContent = 'Copy email';
      }, 2000);
    };
    if (!navigator.clipboard?.writeText) {
      feedback('Copy email', 'Copying is not available here; the address is above.');
      return;
    }
    navigator.clipboard.writeText(address).then(
      () => feedback('Copied ✓', 'Email address copied.'),
      () => feedback('Copy email', 'Could not copy; the address is above.'),
    );
  });
  // The bubble sizes itself as it looks for room, so it follows the window rather than its own size.
  window.addEventListener('resize', () => isOpen() && place());
  return { toggle };
}
