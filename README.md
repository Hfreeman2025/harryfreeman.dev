# Harry Freeman: one building

Harry Freeman's personal site, built as one building. You arrive at the door of the studio where his
ten tools were built: a lit 3D model of the room, with the directory board beside the door, Reception
on one side and a steel filing cabinet on the other. Click the cabinet and the camera walks over; pull
a drawer and it slides out; pull a folder and the camera turns to the desk where that tool was built,
its screen playing the tool, with the folder's contents beside it: what it is, the brief it worked to,
its checks, who built and reviewed it, and **Open**, which launches it live. Esc steps back one place
at a time, and a visible button says where back is.

Four things in the room are live. The lamp follows Great Britain's grid, with a sign giving the
current half-hour's carbon intensity, its time and its source. A radio on the shelf plays Listen to the
Grid, silent until pressed. Reception answers questions with quotations from Harry's CV and the tools'
READMEs; when an answer comes from a README, the camera turns to that desk and the quoted line is
marked in its folder. (Receipt stamps on the folders, verified in the browser, are next: they wait on
the receipts package.)

On a phone, with reduced motion, without WebGL or without script, the same building is the flat
office: the same directory, cabinet, folders, Reception, sign and radio as HTML. Both come from one
content source, and the directory board is the plain, accessible list in both.

![The studio from the door: directory board, filing cabinet, Reception, the grid sign and the radio](shots/office-3/chromium-desktop-door.png)

## See it

Node 22.12 or later. From this folder:

```sh
npm ci --ignore-scripts
npm run build
npm run preview
```

Open **http://127.0.0.1:4400**. `?flat` shows the flat office on a large screen and `?room` the 3D room
anywhere WebGL works; `/#folder-<tool>` opens at that tool's desk. `npm run dev` serves the same with
live reload. The server binds to loopback only.

- **Open** goes to the tool on its own local port (`site.config.json`), so start that tool from its
  folder first. The two terminal tools, gridtop and dreaming, open their recorded sessions.
- **Reception** loads ask-the-record from its own folder, `~/Personal/oss/ask-the-record`: its built
  element, its transformers.js runtime, ONNX Runtime's WebAssembly and the all-MiniLM-L6-v2 model in
  its cache. `STUDIO_COPY_VENDOR=1 npm run build` copies those files into `dist/` for hosting later
  (about 50 MB).
- **The radio** is Listen to the Grid's own embeddable build, vendored as built into
  `public/vendor/radio/` by `npm run vendor radio`, which copies it from
  `~/Personal/lab/listen-to-the-grid/dist-radio` only from a clean commit and writes `SOURCE.json`
  (commit `cd66469`, file hashes). It was rebuilt at that commit and matched byte for byte.

## How it is made

**One page, two renderings.** `index.html` is rendered at build time from `src/content/` (the tools,
their drawers, the CV, the briefs) into the directory, the room's labels, the flat cabinet, the floor
plan and every folder in full. A line of script in the head picks the rendering before first paint:
the room on screens at least 1000 × 620 that welcome motion and have WebGL, the office otherwise.

**The room** (`src/scene/`, `src/room/`). A 1:50 white-card model in Three.js under a work lamp. The
lamp's light and shadows on the floor are baked ahead of time by ray tracing the plan (`npm run bake`);
figures, screens, the cabinet's drawers and box faces are lit live. The figures replay the build
timeline and every screen plays its tool from one video atlas. Every object is a real button or link
placed over the model, so Tab reaches each one and Enter opens it: the cabinet, Reception, the radio and
each desk from the door; each drawer (a button lying over its front) and the folders in an open drawer
at the cabinet. At a desk, the tool's own loop plays over the monitor and the folder opens beside it.
Before the scene is ready the room shows a still of itself from the door (`npm run stills`).

**The grid.** One request, when the page opens and after each half-hour, to the NESO Carbon Intensity
API (`/intensity`, no key, CC BY 4.0) for the current national half-hour. The reading is validated
(`src/room/grid.ts`), banded as Grid Weather bands it, and shown on the sign with its half-hour and
source; the lamp warms and dims as carbon rises. A failed call, a malformed response or a half-hour
that is not current shows "Grid data unavailable" and leaves the light neutral; a reading is never shown
past its half-hour, and nothing is invented or cached as current.

**Reception.** ask-the-record's `highlight` attribute names the folder's README box, which shows the
tool's README as numbered source lines (ask-the-record's own `renderSourceView`, written to
`public/record/lines.json` by `npm run record:ask`, each line with `data-record-line`). When an answer
quotes a README, that README goes into the folder before the element marks the line, then the camera
turns to the desk and the folder opens scrolled to it. A refusal says so and moves nothing.

**Identity.** [IDENTITY.md](IDENTITY.md): one office building; IBM Plex throughout; putty steel, manila,
black felt and green wayfinding signs in the office; the studio keeps its dark, lamp-lit room.

## The build timeline

`~/Personal/site-data/timeline.json`, approved by Harry, was assembled by `scripts/assemble-timeline.ts`
from evidence only: file times in each repository and the DONE lines visible in the builders' herdr
panes. No transcripts were read. Every time is inferred, and each event's note names its evidence.
Schema and rules: [docs/TIMELINE.md](docs/TIMELINE.md).

## Content

- Tool lines, techniques and checks are summarised from each README and IDENTITY.md. Checks are labelled
  _as its README reports them_: this site did not re-run them.
- The loops were recorded on 4 November 2026 from each tool's own server in a silent headless Chromium
  (`npm run record:loops`); the folders say so.
- **The CV** (`src/content/cv.md`, at `/cv.html`) includes the items once marked _to confirm_, made
  generic on Harry's decision of 3 November; nothing names a client, the employer or its product.

## Checks

```sh
npm run gate        # typecheck, lint, unit tests, build, licences (and the vendored radio's)
npm run test:e2e    # both renderings in Chromium, WebKit and Firefox, one at a time (preview on 4400)
npm run perf        # paint, scene ready, bytes, layout shift, frame times (shots/office-3/performance.json)
```

Automation is silent and offline from the world: every browser gets a device-free `AudioContext`
(`scripts/silent.mjs`), the Carbon Intensity API is always mocked, and any request off the machine fails
the check.

- **Unit tests (Vitest, 45):** the grid (bands; measured value over forecast; refusing old, future,
  malformed and empty half-hours; HTTP errors; a reading's expiry; the sign's text, which never shows a
  number when data is unavailable; the light), the room's labels (every object a hidden-until-placed,
  tabbable link or button; each drawer followed by its folders), and the earlier suites: the timeline,
  the replay, rendering, the config, the CV, the filing, the cabinet and the floor plan.
- **Browser checks (33 per browser, all passing in Chromium, WebKit and Firefox on 4 November):**
  - the HTML before scripts;
  - the first screen (directory and poster), a clean console and zero layout shift;
  - by keyboard, cabinet → drawer → folder → the desk turn → Esc back, step by step, with focus
    following;
  - Tab reaching every object at the door;
  - the pointer picking the cabinet, a drawer and a folder, and a desk, in the model;
  - Reception's answer turning to gridtop's desk with the quoted line (790) marked and on screen, and
    Esc returning to Reception;
  - a refusal moving nothing;
  - the sign showing the mocked half-hour and source with the light following it, and the failure
    state with a neutral light;
  - the radio making no audio context until pressed, only device-free ones after, a visible on state,
    the credit beside it, and stopping on leaving;
  - deep links, the directory and the replay;
  - the fallback without WebGL;
  - the flat office: phone, reduced motion and `?flat` with no canvas and no poster download, the
    cabinet, folders, Reception's marked line, sign and radio, tabs, plan, and zero layout shift on the
    phone.

## Measured

Production build on loopback, 1440 × 900 at 2× and 390 × 844 at 3×, three cold runs per browser, on a
shared machine (`shots/office-3/performance.json`). Medians:

|                                  | Chromium | WebKit | Firefox |
| -------------------------------- | -------- | ------ | ------- |
| First contentful paint (desktop) | 48 ms    | 39 ms  | 46 ms   |
| Scene ready (desktop)            | 112 ms   | 139 ms | 125 ms  |
| Transferred at scene ready       | 519 KB   | 411 KB | 507 KB  |
| First contentful paint (phone)   | 44 ms    | 39 ms  | 36 ms   |
| Transferred on the phone         | 160 KB   | 159 KB | 160 KB  |
| Layout shift (desktop, phone)    | 0, 0     | n/a    | n/a     |

Frame times (median / 95th percentile): Chromium, vsync-locked, 16.7 / 16.8 ms at the door, walking
to the cabinet, opening a drawer and turning to a desk, with no frame over 20 ms in any run. Headless
WebKit and Firefox run their frames unthrottled at about 6 / 7 ms, which shows headroom, not what a
display would pace. WebKit and Firefox do not report layout shift; it is measured in Chromium.

## What is weak

- **Receipt stamps are not in yet.** They wait on the receipts package (statements, key and verifier);
  no signature or "verified" state is written by hand meanwhile.
- **Loopback numbers.** Paint and scene-ready times are from a local preview; over a network the
  three.js chunk (142 KB gzipped) and the baked textures add their transfer time.
- **The poster is one framing.** It is shot at the hall's shape on a laptop; on much wider screens the
  live room frames slightly differently from the still it fades in over.
- **A desk's camera stands among the builders.** Figures within reach step out of the picture there;
  passers-by in the aisle can still cross the edge of the frame.
- **Safari's own Tab order.** Room objects carry an explicit tabindex so Safari's default Tab reaches
  them; the directory's plain links follow Safari's setting (Option-Tab), as on any site.
- The timeline's times are inferred from file times; three hand-ins come from pane DONE lines.
- Meaning search is heavy (about 50 MB on first use, mostly ONNX Runtime's WebAssembly).
- Not hosted, and no Content-Security-Policy yet. If one is added it needs `connect-src
  https://api.carbonintensity.org.uk`, `worker-src 'self'` (the radio's loudness worker) and
  `'wasm-unsafe-eval'` (Reception).
- Not tested with a real screen reader, or in real Safari: Harry will try it.

## Credits and licences

Code: MIT, Copyright (c) 2026 Harry Freeman. Data: carbon intensity from the NESO Carbon Intensity API,
CC BY 4.0, credited on the sign and beside the radio. Everything else third-party (three.js, Valibot,
xterm.js, the vendored radio and the zod inside it, ask-the-record, transformers.js, ONNX Runtime Web,
all-MiniLM-L6-v2, IBM Plex) is listed with its licence in [public/NOTICES.txt](public/NOTICES.txt),
served at `/NOTICES.txt`. `npm run licences` checks every installed package is MIT, Apache-2.0, BSD or
ISC (the fonts aside) and that the vendored radio carries its MIT licence and source record. Vite is
pinned to 7.3.7 because Vite 8 brings in lightningcss, which is MPL-2.0. Nothing here is hosted or
published.
