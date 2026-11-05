// The grid's and the radio's cards: each opens beside its object on hover or focus, stays open when
// clicked, and always fits inside the part of the room on screen; Esc closes it and returns to the
// object. One card at a time. Shared by the classic room and the desk.

export function popovers(hall: HTMLElement, pairs: ReadonlyArray<readonly [HTMLElement | null, HTMLElement | null]>): void {
  /** One card at a time: opening one closes the others. */
  const closers = new Map<HTMLElement, () => void>();
  for (const [trigger, pop] of pairs) {
    if (!trigger || !pop) continue;
    let pinned = false;
    let closing: ReturnType<typeof setTimeout> | undefined;
    const place = () => {
      const t = trigger.getBoundingClientRect();
      const hr = hall.getBoundingClientRect();
      const view = {
        top: Math.max(hr.top, 0),
        bottom: Math.min(hr.bottom, window.innerHeight),
        left: Math.max(hr.left, 0),
        right: Math.min(hr.right, window.innerWidth),
      };
      const w = pop.offsetWidth;
      const h = pop.offsetHeight;
      const margin = 12;
      let x = t.left + t.width / 2 - w / 2;
      let y = t.bottom + 10;
      if (y + h > view.bottom - margin) y = t.top - h - 10;
      x = Math.min(Math.max(x, view.left + margin), view.right - w - margin);
      y = Math.min(Math.max(y, view.top + margin), view.bottom - h - margin);
      pop.style.transform = `translate(${(x - hr.left).toFixed(1)}px, ${(y - hr.top).toFixed(1)}px)`;
    };
    const open = () => {
      clearTimeout(closing);
      for (const [other, closeOther] of closers) if (other !== trigger) closeOther();
      pop.dataset.open = 'true';
      trigger.setAttribute('aria-expanded', 'true');
      place();
    };
    const close = () => {
      clearTimeout(closing);
      pinned = false;
      delete pop.dataset.open;
      trigger.setAttribute('aria-expanded', 'false');
    };
    closers.set(trigger, close);
    const later = () => {
      clearTimeout(closing);
      closing = setTimeout(() => {
        if (!pinned && !pop.contains(document.activeElement) && document.activeElement !== trigger) close();
      }, 220);
    };
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && pop.dataset.open) close();
    });
    trigger.addEventListener('pointerenter', open);
    trigger.addEventListener('pointerleave', later);
    pop.addEventListener('pointerenter', open);
    pop.addEventListener('pointerleave', later);
    trigger.addEventListener('focus', open);
    trigger.addEventListener('blur', later);
    pop.addEventListener('focusout', later);
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      pinned = !pinned || pop.dataset.open !== 'true';
      if (!pinned) return close();
      open();
      // Into the card: the radio's switch, or the sign's reading for a screen reader.
      (pop.querySelector<HTMLElement>('button') ?? pop).focus();
    });
    pop.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
      trigger.focus();
    });
    new ResizeObserver(() => pop.dataset.open && place()).observe(pop);
  }
}
