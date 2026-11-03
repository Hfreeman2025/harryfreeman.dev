# Harry Freeman: the studio

The front door of Harry Freeman's personal site. A 1:50 white-card model of the studio where his
portfolio was built sits under a work lamp: ten desks, one per piece, a builder at each, a reviewer at
the front, and the three briefs pinned to the back wall. The figures replay the build (who built what,
each hand-off to the reviewer, each piece sent back), every screen plays a silent loop recorded from
the real piece, and choosing a desk lowers the camera over the builder's shoulder until the screen
becomes that piece's card. Ask the studio answers questions with quotations from Harry's CV and the ten
READMEs, entirely in the browser, and lights the desk the answer came from. Name, role, a plain line,
the CV and every desk are real HTML before any 3D loads; phones, reduced motion and screen readers get
the same content as a list with a still photograph of the model.

![The studio at 1440×900](shots/pass-2/chromium-desktop-02-studio.png)

## See it

Node 22.12 or later. From this folder:

```sh
npm ci --ignore-scripts
npm run build
npm run preview
```

Open **http://127.0.0.1:4400**. `npm run dev` serves the same thing with live reload. The server binds
to loopback only.

- **Ask the studio** loads ask-the-record from its own folder, `~/Personal/oss/ask-the-record` (its
  built element, its transformers.js runtime, ONNX Runtime's WebAssembly and the all-MiniLM-L6-v2
  model already in its cache). Nothing is copied or downloaded, and the page makes no request to
  another site. `STUDIO_COPY_VENDOR=1 npm run build` copies those files into `dist/` for hosting
  later (about 50 MB).
- **Open** on a desk goes to the piece on its own local port (`site.config.json`), so start that piece
  from its folder first. The two terminal pieces, gridtop and dreaming, open their own recorded
  sessions on this site.
- `?list` shows the list version on any screen.

## How a visit goes

1. **First paint, under 100 ms:** the title strip (name, role, one line, CV, email, LinkedIn, _Skip to
   the list_) and a still photograph of the model, all HTML and one image.
2. **The studio comes alive** (about 0.1 s on loopback): the canvas fades in over the photograph and the
   replay starts. Figures type at their desks, carry sheets to the review table, wait their turn, carry
   sent-back work home with a red-pencil corner, and accepted work goes up on the board. The caption
   shows the real time being replayed and the latest hand-off. **Pause** stops it.
3. **Choose a desk** (click it, or Tab to its label and press Enter): the camera glides down over the
   builder's shoulder, the monitor's rectangle becomes the card (a larger loop, the line, the
   technique and its citation, who built it, who reviewed it, the review rounds, the brief it worked
   to, its checks, and **Open**). Escape or _Back to the studio_ glides out and returns focus.
4. **Ask the studio:** keyword search and the suggested questions answer at once; your own question
   loads the meaning model on first use, about 50 MB (a 23 MB embedding model and 27 MB of ONNX
   Runtime WebAssembly), served from ask-the-record's folder and then cached. Answers are quotations with their source; a desk whose README is quoted lights up and its
   builder stands to answer. When nothing supports an answer, it says so and shows the numbers.

## How it works

**Medium.** An architect's presentation model under an anglepoise lamp; the page is the drawing sheet
and its title strip. [IDENTITY.md](IDENTITY.md) has the six lines: Jost (a free Futura descendant),
card, basswood and cutting-mat green on a dark room, lamp amber for focus, red pencil only for work
sent back, and the rule that only the build moves.

**Three.js, vanilla.** One canvas, one scene, no component tree: React and react-three-fiber would add
weight and a second rendering model for no gain here. The scene module and Three.js load after first
paint as one 142 KB (gzipped) chunk.

**The model is a plan.** `src/scene/layout.ts` describes every static object as axis-aligned boxes in
metres: walls cut low at the sides as in a sectional model, desks, chairs, monitors, the review table,
the board, the drafting table. The renderer draws them as one instanced mesh per material (five draw
calls for 107 boxes). Figures are turned card silhouettes (a seven-sided lathe), all alike, standing
for roles, never for people.

**Baked light.** `npm run bake` ray-traces the same plan in Node: a disc lamp sampled with 16 shadow
rays per texel, 20 ambient-occlusion rays, a soft-edged shade, and bounce light from the white card. The
floor (1024×711) and the workbench with its cutting mat (768×595) are written as WebP, 16 KB and 3 KB,
and drawn unlit. Only the figures, screens and box faces are lit live, by a spotlight and hemisphere
light matched to the bake's units, so live and baked surfaces agree.

**Screens.** `npm run record:loops` drives each real piece on its own port in a silent headless
Chromium (the V3 `silent.mjs` pattern: no audio device is ever opened), records eight seconds of it
doing its signature thing (GPT in a tab training, the lie detector clustering answers, the race
replay, the wind field, the score being engraved, a number being dragged in Sourced, the tamper demo
in receipts, the two terminal recordings), and encodes them with ffmpeg: one 1920×480 atlas (375 KB
WebM, 289 KB MP4) feeds all ten monitors from a single video decode, and each piece gets a 960×600 loop
for its card and a still for the list.

**The replay.** `src/timeline/replay.ts` compresses real time (minutes become fractions of a second, a
night under three seconds), keeps order, and guarantees each hand-off enough time to be seen. The
schema, its validation rules and the placeholder are in [docs/TIMELINE.md](docs/TIMELINE.md).

**Ask the studio.** `npm run record:ask` builds one record from `src/content/cv.md` and the ten
READMEs with ask-the-record's own build and embedding code, run from its folder (1,998 facts, 1.59 MB,
900 KB gzipped, loaded only when someone reaches for the box). The three suggested questions are
embedded at build time, so their answers need no model. Each quote's top-level section names its
source; that is how an answer finds its desk.

**Links first.** The desk labels are `<a href="#work-…">` links rendered into the HTML at build time,
placed over the model each frame. Without JavaScript they jump to the list entry; with it, they glide.

## The content, and what is left out

- Piece lines, techniques and checks are summarised from each README and IDENTITY.md as they stood on
  2 November 2026. Checks are labelled _as its README reports them_: this site did not re-run them.
  Several pieces were mid-way through V3 while this was built; the Ask record can be rebuilt with
  `npm run record:ask` when their READMEs settle.
- **The timeline is a placeholder** until `~/Personal/site-data/timeline.json` arrives. Builder,
  reviewer and round counts on every desk say so, and the model's caption says so in amber.
- **The CV** (`src/content/cv.md`, rendered at `/cv.html`) keeps only confirmed claims. Everything the
  draft marks _to confirm_ is out: the redacted-term 250 client (and the stat that repeats it), “shared with the
  CEO”, “took the firm from project-based consulting to a platform product”, “CEO-approved May 2026”,
  the gated Claude Code programme, the list of first tools, the July 2025 AI policy, membership dates,
  and the word _live_ on two products. The employer and its product are not named, per the brief's
  rule against mentioning the company; the phone number is left off a public page. It is written in
  the third person so each sentence stands alone as a quotation.

## Checks

```sh
npm run gate        # typecheck, lint, unit tests, build, licences
npm run test:e2e    # Chromium, WebKit, Firefox, one at a time (needs the preview on 4400)
npm run perf        # paint, bytes and frame times (writes shots/performance.json)
npm run shots -- pass-2 chromium
```

- **Unit tests (Vitest, 27):** the timeline schema (accepts the placeholder and the documented
  example; rejects out-of-order events, impossible hand-offs, unknown actors and pieces, wrong roles,
  stray fields, zoneless and impossible dates, long notes), the replay (gap compression, minimum
  hand-off times, every phase from idle to done, real-time interpolation), rendering (escaping, every
  desk a link, the placeholder labelled and a real timeline not), the config (bad URLs rejected), the
  CV (no unconfirmed claim, no employer or client name), which desks an answer lights, where a
  quote's source link goes, and the asciicast parser.
- **Browser checks (13 per browser):** HTML-first content and every link before scripts; the studio
  comes alive with a clean console; Tab and Enter open a desk with focus in the card and Escape
  restores it; clicking a desk in the model opens it; pause and play; an answer lights the right desk;
  a refusal lights none; _Skip to the list_; reduced motion gets the list and the still with no canvas;
  a phone gets the list with no sideways scroll; without WebGL the page says so and becomes the list;
  the CV holds only confirmed claims; a terminal piece plays. Results: `shots/e2e-<browser>.json`.

## Measured

Production build, `vite preview` on loopback, Chromium (full build, GPU compositing) at 1440×900 and
2× pixel ratio, three cold runs, on a shared machine with other builds running (`shots/performance.json`):

|                                                  |                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| First contentful paint                           | 52–64 ms (median 64)                                                                              |
| Studio interactive (canvas live, replay running) | median 107 ms                                                                                     |
| Transferred when interactive                     | 424–476 KB (HTML, CSS, scripts, font, baked light, the still)                                     |
| Transferred after 5 s                            | about 850 KB, with the video atlas playing on all ten screens                                     |
| JavaScript, gzipped                              | 11 KB at first paint (page, Ask wiring); 142 KB for Three.js and the scene, loaded straight after |
| Frame time while the replay runs (5 s)           | median 16.7 ms, p99 16.8 ms, worst 16.8 ms, no frame over 20 ms                                   |
| Frame time during the glide to a desk            | median 16.7 ms, worst 16.8 ms                                                                     |
| Ask the studio record                            | 1.59 MB (900 KB gzipped), fetched only when someone reaches for the box                           |

The browser suite's first page, in a freshly launched Chromium on the loaded machine, showed text at
2.6 s and the studio at 2.7 s; WebKit and Firefox showed the studio at 0.23 s each.

## What is weak

- **The replay is invented until the real timeline arrives.** It is labelled everywhere, but the
  piece of the site that shows how Harry works is, today, a layout of made-up hand-offs.
- **Checks and screens are a snapshot.** Several pieces were mid-way through V3 on 2 November; the
  loops were recorded from their running servers at 16:17–16:20 and the card text from their READMEs
  the same afternoon. `npm run record:loops`, `npm run record:ask` and `npm run stills` refresh them.
- **The model is plain.** Identical desks, boxes and turned figures, no props, and the lamp is felt
  rather than seen. Figures can pass through each other when two walk the same aisle at once.
- **Meaning search is heavy** (about 50 MB on first use, mostly ONNX Runtime's WebAssembly).
- **Hosting is not done.** The preview server serves ask-the-record's files from its folder; a static
  host needs `STUDIO_COPY_VENDOR=1`, and every piece's **Open** link points at a local port.
- **Browser noise outside the page's control:** headless Firefox logs “WebGPU is disabled by
  blocklist” when ask-the-record's worker asks for a GPU (allowed, narrowly, in the test); headless
  Chromium's software compositor logs GL “ReadPixels” stalls, which the GPU-composited build used for
  testing does not.
- Not tested with a real screen reader; the structure (links, headings, a labelled dialog with focus
  management) is checked, the experience is not.

## Credits and licences

Code: MIT, Copyright (c) 2026 Harry Freeman. Runtime dependencies: Three.js (MIT), Valibot (MIT),
xterm.js (MIT, terminal pages only). Type: Jost by the Jost Project Authors, SIL Open Font Licence 1.1,
self-hosted (`public/fonts/OFL-Jost.txt`). Used from ask-the-record's folder, unmodified: its element
(MIT), transformers.js (Apache-2.0), ONNX Runtime Web (MIT) and Xenova/all-MiniLM-L6-v2 (Apache-2.0).
`npm run licences` checks all 142 installed packages are MIT, Apache-2.0, BSD or ISC (the font aside).
Vite is pinned to 7.3.7 because Vite 8 brings in lightningcss, which is MPL-2.0.

The screens show Harry's ten projects, recorded from their own servers; the two terminal recordings
are the projects' own asciicasts, unchanged. Their data credits (NESO Carbon Intensity API, CC BY 4.0;
Open-Meteo; Project Gutenberg) live in those projects. Nothing here is hosted, committed or published.
