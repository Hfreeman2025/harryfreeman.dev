// One building, two renderings of the same content. The head script chose the mode before first paint:
// "room" (the lit 3D studio, on large screens that welcome motion and have WebGL) or "office" (the
// flat office: phones, reduced motion, no WebGL, and without script). Reception, the grid sign, the
// radio and the folders are shared; only how you move between them differs.

import { setupAsk } from './ask';
import { isPieceId, type PieceId } from './content/pieces';
import type { DeskControl } from './desk/main';
import { startEntrance } from './entrance/main';
import { loadLines, showLines } from './folder';
import { type OfficeControl, startOffice } from './office/main';
import { type GridMix, NEUTRAL_LIGHT, type RoomLight, type SignText } from './room/grid';
import type { RoomControl } from './room/main';
import { setupRadio } from './room/radio';
import { startGridSign } from './room/sign';
import { parseTimeline } from './timeline/schema';

const root = document.documentElement;
let control: OfficeControl | RoomControl | DeskControl | null = null;
let light: RoomLight = NEUTRAL_LIGHT;
let sign: SignText | null = null;
/** The grid's wind and solar shares, for the desk's window: undefined until asked, null if it could not be read. */
let mix: GridMix | null | undefined;
let mark: Range | null = null;

/** The control, if it is the desk's. */
const deskOf = (c: typeof control): DeskControl | null => (c && 'walkIn' in c ? (c as DeskControl) : null);

function say(text: string): void {
  const status = document.getElementById('room-status');
  if (status) status.textContent = text;
}

/** Light the labels, directory rows, folders and list entries whose READMEs an answer quoted. */
function markAnswering(pieces: readonly PieceId[]): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-answering]')) el.removeAttribute('data-answering');
  for (const piece of pieces) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-piece="${piece}"], #work-${piece}`)) el.dataset.answering = 'true';
  }
}

setupAsk({
  prepare: loadLines,
  onAnswer(pieces, result) {
    markAnswering(pieces);
    mark = null;
    // The quoted README goes into the folder now, before Reception marks the line in it.
    const first = pieces[0];
    if (first) showLines(first);
    control?.answer(pieces, () => mark, result);
  },
  onLocated(range) {
    mark = range;
  },
  onSource: (piece) => control?.source(piece),
});

startGridSign({
  light(next) {
    light = next;
    // Whether the room's light follows a reading or stays neutral, for the checks and the stills.
    root.dataset.light = next === NEUTRAL_LIGHT ? 'neutral' : 'grid';
    if (control && 'setLight' in control) control.setLight(next);
  },
  sign(text) {
    sign = text;
    if (control && 'setSign' in control) control.setSign(text);
  },
  mix(next) {
    mix = next;
    deskOf(control)?.setMix(next);
  },
});
setupRadio();

/** The desk or the room, or the flat office, ready to be seen: the door hands over once it is. */
let isReady: () => void = () => undefined;
const ready = new Promise<void>((resolve) => {
  isReady = resolve;
});

async function startRoomMode(): Promise<void> {
  try {
    const timeline = parseTimeline(JSON.parse(document.getElementById('timeline-data')?.textContent ?? 'null'));
    // The desk is the way in; ?style= opens the classic room or a style direction. The controller and its
    // engine (three.js) download together.
    const room =
      root.dataset.scene === 'desk'
        ? await (await Promise.all([import('./desk/main'), import('./desk/engine')]))[0].startDesk(timeline)
        : await (await Promise.all([import('./room/main'), import('./scene/engine')]))[0].startRoom(timeline);
    room.setLight(light);
    if (sign) room.setSign(sign);
    control = room;
    if (mix !== undefined) deskOf(control)?.setMix(mix);
    root.dataset.stage = 'live';
    performance.mark('scene-ready');
    const piece = /^#folder-(.+)$/.exec(location.hash)?.[1] ?? '';
    if (isPieceId(piece)) room.pull(piece);
  } catch (error) {
    // No 3D here: the flat office, saying why.
    root.dataset.mode = 'office';
    delete root.dataset.station;
    say(`The 3D room could not start here (${error instanceof Error ? error.message : String(error)}), so this is the flat office.`);
    control = startOffice();
  }
  isReady();
}

if (root.dataset.mode === 'room') void startRoomMode();
else {
  root.dataset.mode = 'office';
  control = startOffice();
  isReady();
}
startEntrance({ ready, desk: () => deskOf(control) });
