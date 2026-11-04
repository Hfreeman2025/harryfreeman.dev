# Harry Freeman: the office

Harry Freeman's personal site, built as one office building. The way in is the lobby: a directory
board listing every tool and where it is filed, Reception for questions, and at the heart a steel
filing cabinet. Its four drawers are filed by theme; each of the ten tools is a manila folder you pull
by its tab, and an opened folder holds a recorded loop of the tool (labelled recorded), what it is, who
built it and who reviewed it, the brief it worked to, its checks and **Open**, which launches it live.
The floor plan on the lobby wall replays the build: dots carry work from each desk to the review
table, back in red when it was sent back, green when it was accepted. Through the lobby door is the
studio floor itself, kept as a lit 3D model of the room, where every screen plays its tool and you can
sit at any desk. Everything a recruiter needs is plain HTML before any script; phones, reduced motion
and screen readers get the same content.

![The lobby: directory board, filing cabinet with a drawer pulled out, Reception](shots/office-2/chromium-desktop-02-second-drawer.png)

## See it

Node 22.12 or later. From this folder:

```sh
npm ci --ignore-scripts
npm run build
npm run preview
```

Open **http://127.0.0.1:4400** for the lobby and **/studio.html** for the studio floor. `npm run dev`
serves the same with live reload. The server binds to loopback only.

- **Open** on a folder goes to the tool on its own local port (`site.config.json`), so start that tool
  from its folder first. The two terminal tools, gridtop and dreaming, open their recorded sessions.
- **Reception** loads ask-the-record from its own folder, `~/Personal/oss/ask-the-record`: its built
  element, its transformers.js runtime, ONNX Runtime's WebAssembly and the all-MiniLM-L6-v2 model in
  its cache. Nothing is copied or downloaded and no request goes to another site.
  `STUDIO_COPY_VENDOR=1 npm run build` copies those files into `dist/` for hosting later (about 50 MB).
- Rooms link to each other: `/#folder-<tool>` pulls that folder, `/studio.html#desk-<tool>` sits you at
  that desk, and every folder and desk card links to the other.

## The rooms

**The lobby (`index.html`).** The directory board is the plain path through the site: every tool is a
link with its drawer, and the same links reach the studio, the floor plan, the briefs and the CV. The
cabinet is HTML and CSS in three dimensions: each drawer front is a button that slides the drawer out;
a drawer's folders are links kept out of the tab order, and hidden, until it is open; tabs are cut
left, centre and right so each can be pulled. A pulled folder opens over the page from where it sat.
Reception answers with quotations; an answer pulls the drawer it came from and marks the folder and
the desk. The floor plan is drawn in metres from the same plan as the 3D model, with a prop on each
desk that says what its tool does (a scope trace, a corrected news page, a stopwatch, a weather chart,
a terminal and clock, a score, a calculator and rule, a card index, a coffee and a diff, a receipt
spike).

**The studio floor (`studio.html`).** A 1:50 white-card model in Three.js under a work lamp. The lamp's
light and shadows on the floor were baked ahead of time by ray tracing the plan (`npm run bake`); only
figures, screens and box faces are lit live. Figures replay the build timeline, every screen plays its
tool from one 375 KB video atlas, and choosing a desk glides the camera over the builder's shoulder until
the screen becomes that tool's card. A green sign leads back to the lobby and the archive.

**Identity.** [IDENTITY.md](IDENTITY.md): one office building; IBM Plex throughout (Sans to read, Mono
for data, Sans Condensed for signs, drawer labels and tabs); putty steel, manila, black felt and green
wayfinding signs; the studio keeps its dark, lamp-lit room.

## The build timeline

`~/Personal/site-data/timeline.json`, approved by Harry, was assembled by `scripts/assemble-timeline.ts`
from evidence only: file creation and modification times in each repository (each SPEC.md, the first
file a builder created, the shots folder for each version, DONE and report files) and the DONE lines
visible in the builders' herdr panes. No transcripts were read. Every time is inferred, and each
event's note names its evidence; the site shows that note under the replay and says on every desk that
the times are inferred. Schema and rules: [docs/TIMELINE.md](docs/TIMELINE.md).

## Content

- Tool lines, techniques and checks are summarised from each README and IDENTITY.md. Checks are labelled
  _as its README reports them_: this site did not re-run them.
- The loops were recorded on 4 November 2026 from each tool's own server in a silent headless Chromium
  (`npm run record:loops`); the folders say so.
- **The CV** (`src/content/cv.md`, at `/cv.html`) follows the draft, with the items it marked _to
  confirm_ included on Harry's decision of 3 November and made generic: the redacted-term 250 client is "a
  large listed company", and nothing names a client, the employer or its product. It is in the third
  person so each sentence stands alone as a quotation; the phone number is left off a public page.

## Checks

```sh
npm run gate        # typecheck, lint, unit tests, build, licences
npm run test:e2e    # both rooms in Chromium, WebKit and Firefox, one at a time (needs the preview on 4400)
npm run perf        # both rooms: paint, bytes, layout shift, frame times (shots/performance.json)
node scripts/office-shots.mjs office-2 chromium   # the lobby's states at 1440×900 and 390×844
```

- **Unit tests (Vitest, 36):** the timeline schema and its documented example, the replay, rendering
  (every tool a link, the placeholder labelled, room-to-room links), the config, the CV (generic
  wording present, no client or employer name), the filing (every tool in exactly one drawer), the
  directory, the cabinet (closed drawers, inert trays, folders out of the tab order, tabs cut three
  ways), the floor plan (every desk a link with a prop, names clear of chairs), Reception's desk
  lighting and quote links, and the asciicast parser.
- **Browser checks (29 per browser, all passing in Chromium, WebKit and Firefox on 4 November):** the
  lobby's HTML before scripts; a clean console and zero layout shift; keyboard drawer, then folder, then
  Escape with focus returned; one drawer at a time, with closed drawers hiding their folders; the
  directory and the plan pulling the right folder; Reception answering and marking the folder and desk;
  reaching for the question box moving nothing; every tab's whole name at both sizes; desk names clear
  of chairs; the door to the studio and the way back; deep links both ways; reduced motion; the phone
  (no sideways scroll, the bottom drawer clearing Reception); and the studio's own fourteen checks.

## Measured

Production build on loopback, Chromium with GPU compositing, 1440×900 at 2×, three cold runs, on a
shared machine (`shots/performance.json`):

|                        | Lobby                         | Studio floor                                        |
| ---------------------- | ----------------------------- | --------------------------------------------------- |
| First contentful paint | 40 ms                         | 40 ms                                               |
| Interactive            | at first paint                | 76 ms (canvas live)                                 |
| Transferred            | 158 KB after 2 s              | 499 KB when interactive, 873 KB after 5 s           |
| Layout shift           | 0                             | 0                                                   |
| Worst frame            | 16.8 ms while a drawer slides | 16.8 ms while the replay runs and the camera glides |

## What is weak

- **WebKit draws the cabinet flat in testing.** Playwright's headless WebKit on this Mac does not draw
  nested CSS 3D (a drawer moved towards the viewer inside a 3D container), though Chromium and Firefox
  do; the minimal reproduction is `shots/office-2/webkit-flattens-nested-3d-chromium-firefox-webkit.png`.
  Its hit-testing is 3D-aware, so every check passes, but in WebKit's screenshots drawers look closed.
  Real Safari could not be checked without opening a window on the shared machine: open
  http://127.0.0.1:4400 in Safari and pull a drawer to confirm.
- The timeline's times are inferred from file times; three hand-ins come from pane DONE lines.
- The screens and card text are a snapshot of tools still being polished.
- Meaning search is heavy (about 50 MB on first use, mostly ONNX Runtime's WebAssembly).
- Not hosted: the preview serves ask-the-record from its folder and **Open** points at local ports.
- Not tested with a real screen reader; structure, labels and focus are checked, the experience is not.

## Credits and licences

Code: MIT, Copyright (c) 2026 Harry Freeman. Runtime dependencies: Three.js (MIT, studio only), Valibot
(MIT), xterm.js (MIT, terminal pages only). Type: IBM Plex Sans, Mono and Sans Condensed by IBM, from
@fontsource 5.3.0, SIL Open Font Licence 1.1, self-hosted (`public/fonts/plex/OFL.txt`). Used from
ask-the-record's folder, unmodified: its element (MIT), transformers.js (Apache-2.0), ONNX Runtime Web
(MIT) and Xenova/all-MiniLM-L6-v2 (Apache-2.0). `npm run licences` checks every installed package is
MIT, Apache-2.0, BSD or ISC (the fonts aside). Vite is pinned to 7.3.7 because Vite 8 brings in
lightningcss, which is MPL-2.0. The screens show Harry's ten tools; their data credits (NESO Carbon
Intensity API, CC BY 4.0; Open-Meteo; Project Gutenberg) live in those projects. Nothing here is hosted
or published.
