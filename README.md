# Harry Freeman: one building

Harry Freeman's personal site, built as one building. You arrive at the door of the studio where his
ten tools were built, drawn as an architect's study model on a sheet of paper: card walls, a balsa
floor, stone-white scale figures, the directory board beside it, Reception on one side and, nearest
the door under its own soft light, the steel filing cabinet. Click the cabinet and the camera walks over; pull
a drawer and it slides out; pull a folder and the camera turns to the desk where that tool was built,
its screen playing the tool, with the folder's contents beside it: what it is, the brief it worked to,
its checks, who built and reviewed it, and **Open**, which launches it live. Esc steps back one place
at a time, and a visible button says where back is.

A builder sits at each desk and the reviewer stands at the review table. Nobody walks: in the replay
of the build, the work moves. A sheet goes from a desk to the review table, then back to the desk
tinted red when it was sent back, or on to the accepted board tinted green. At rest only the cabinet and
Reception are labelled; a desk's name appears when you point at it or reach it by keyboard.

Four things in the room are live. The lamp follows Great Britain's grid, and the current half-hour's
carbon intensity is printed on a sign on the wall, with its credit beside it. A radio on the shelf beside it plays Listen to
the Grid, silent until pressed. The sign's and the radio's cards open on hover, focus or click. Reception answers questions with quotations from Harry's CV and the tools'
READMEs; when an answer comes from a README, the camera turns to that desk and the quoted line is
marked in its folder. Every folder carries the tool's receipt stamp: its latest signed check results,
which you can check in the browser.

On a phone, with reduced motion, without WebGL or without script, the same building is the flat
office: the same directory, cabinet, folders, Reception, sign and radio as HTML. Both come from one
content source, and the directory board is the plain, accessible list in both.

![The studio from the door: the filing cabinet nearest, the seated builders, the reviewer at the review table, the grid sign and the radio](shots/office-4/chromium-desktop-door.png)

The same moment of the replay before and after this redesign: [before](shots/office-4/chromium-moment-before.png), [after](shots/office-4/chromium-moment-after.png).

## On this branch: the desk

On `design/desk-miniature` the page opens on Harry's desk at real scale, filling the window, with the
studio as a living miniature on it, drawn as a management sim: zoned floors with their names painted
where nothing stands in front of them, a status gem and a name tag per builder, and the work travelling
on paths to review. The things on the desk are the site's parts (`src/desk/`):

- **The door.** Every fresh visit and every reload starts outside Harry's office door: a corridor, the
  door with its frosted pane lit warm from inside, a brass plate reading "Harry Freeman, Head of AI"
  (engraved on the plate in the scene), a handle and a doormat. The way in is a **knock** (the door, the button
  or Enter): two knocks, synthesised in WebAudio (a filtered-noise rap over a resonant woody body, 180
  ms apart), the door jolting and "knock" popping beside it on each; then a voice from inside, "Hello,
  welcome! ... Come and explore." (Kokoro, generated offline; `public/NOTICES.txt`), its words in a
  speech bubble from behind the door on the same beat; and as the second sentence ends the door swings
  open. Nothing touches audio before the knock's click; a speaker on the door view turns the sound off
  (remembered), and the words show either way. The door and the room behind it are the desk's
  own scene (`src/desk/room.ts`, 125 units to the metre, so the desk view's camera is a seated person's
  eyes): **Come in** (the door, the button or Enter) swings it open and walks through the room to the
  long desk under the window, lowering into the seat and ending exactly on the desk's own camera (its
  position, target, field of view and focus), so there is nothing to swap at the end. The door's poster
  paints first; the real door replaces it only once the whole desk has loaded, and Come in pressed
  before then says "Opening…" and waits. **Skip to the desk** and Esc go straight in; reduced motion
  cuts. Back and Forward (and the back-forward cache) return to the desk, and a deep link
  (`#folder-<tool>`, `#ask`), `?in`, a style or a still never show the door; `?door` always does. On
  phones (until the phone diorama) and without WebGL or script, the door is a hero above the page: a
  light door (`src/entrance/door.ts`) that opens onto warm light, or its poster (the plate engraved in
  it), with Come in a link to the content.
- **The office.** The room the walk crosses is furnished in the same cartoon language
  (`src/desk/furnish.ts`): a two-pane window over the desk onto a calm UK roofline, lit for the visitor's
  own time of day (morning, day, evening, night), with wind turbines on the hill that turn at a pace set
  by the grid's current wind share and solar panels on a near roof that glint while solar is a fifth of
  the grid or more (the same NESO data as the sticky note, its `/generation` mix; without a reading the
  scene is still and neutral). A walnut bookshelf holds the sources behind the tools as plain titled
  spines (semantic entropy, induction heads, SummaC, in-toto, the GUM and the rest, from the tools'
  READMEs), with the radio from the kit on it, the same Listen to the Grid radio and card as in the model.
  A whiteboard sketches the ten tools round "the briefs", arrows to "review", in marker. A rug, a desk
  lamp (lit after dark), a radiator under the window, a coat stand with a jacket, plants, a print, a
  cable run, a dado rail, a chair pushed back, contact shadows, and light through the window on the
  floor, coloured by the time of day. The walk in is paced like a person (about 6.6 s): the door swings open, a step to the
  threshold and a pause there (0.4 s) to take the room in, an unhurried walk that slows while it looks at
  the shelf and the whiteboard, then a gentle slow-in down into the seat. Skip and Esc cut to the desk
  at any moment of it. Seated, the view is all desk; **The room** (a tag at the top of the desk view) stands you up
  to look round the back wall, where a spine under the pointer gives its title, authors and the tool it
  fed, the shelf's tag lists them all for keyboards and screen readers, and the radio opens the radio's
  card. Sit back down, Esc or the wheel return to the desk.
- **The ultrawide.** A real-scale 34-inch monitor at the back of the desk (`src/desk/monitor.ts`).
  Seated, only its lower edge shows along the top of the view; walking in, it is seen whole. Its screen
  is drawn in the site's own style: a wallpaper in the desk's palette, a frosted dock of plain palette
  tiles (no logos, no one's artwork), and a dark terminal window titled "ghostty" running an authored
  session that replays the build: a prompt line, then each hand-off from the approved timeline in the
  caption's own words, in step with it, and a status line, "auto mode on · 10 builders". Never a real
  transcript or any real output. It is a canvas texture redrawn only when a new line arrives, sharp
  through the tilt-shift like the other lettering, and decorative (the canvas is hidden from screen
  readers; the caption carries the same words).
- **The Speak to me mic.** A podcast mic by the nameplate, with a printed tag. It never listens: no
  microphone is asked for, no permission, no audio. Clicking it (or Enter) lights its ON AIR lamp and
  opens a contact card: Harry's email with a Copy button (which says Copied only once the clipboard has
  it), LinkedIn and the CV. Esc or a click away closes it. The flat page has a plain Speak to me link in
  its header.
- **The nameplate and the card.** Harry's name and role are on a nameplate, his one-line intro and his
  CV, Email and LinkedIn links on a card beside it. **Everything lettered on a thing is printed in the
  scene** (`src/desk/lettering.ts`): the nameplate, the card, the door's brass plate, the grid's credit
  slip and the mic's tag are drawn into their own textures, so whatever stands in front of them hides
  their words as it would hide paint, and they stay sharp through the tilt-shift (their faces mark the
  render's alpha, depth-tested, and the blur leaves those pixels alone). The page keeps the same words
  as real HTML, visually hidden (clipped, not removed), in reading order: the header (`.masthead`), the
  door plate and the credit, before any script. Tab to a card link and the printed link is ringed on
  the card; a click on a printed link is a click on the real one. The tags, notes, bubbles and panels
  that float over the scene go when what they name is out of sight behind something (sight lines from
  the camera). The index box stands clear of the nameplate at every window shape. A quiet index along the foot lists the ten tools, Ask, the
  briefs and the CV, the directory for keyboards, screen readers and phones. Without WebGL the same
  header and index are a plain editorial header.

- **The model.** Click it (or scroll down) and the camera swoops in: high over the desk at first, then
  levelling out late into a low three-quarter view across the office, at the monitors, each playing its
  tool's recorded loop. The tilt-shift that makes the desk read as a miniature pulls to sharp on the way
  down. Esc, scrolling up or the visible button rises back out.
- **The index-card box** is the directory and the archive. Pull a card and its builder gets up from their screen while the
  camera leans in square to it, as if looking over their shoulder: the tool's recorded loop plays on that
  screen (a crisp video laid exactly over it once the camera has squared up; the screen's texture during
  the move), with **Open** under the bezel. The card beside it keeps the details, the stamp and the
  README lines. Whatever stands in front of the screen is cut away.
- **The notebook** is the briefs: a page a round (BRIEF, V2, V3), each line one of the tools' curated
  asks from `src/content/pieces.ts`, never the raw brief files. Turning to a round replays it.
- **The stamp and ink pad** are the receipt stamps. The card's stamp runs the real `verifyStamp`; the
  ink, PASSED, FAILED or NOT VALID, lands on the card only once the check has resolved, and a valid
  signature over failed checks (dreaming) inks FAILED beside "Signature valid".
- **The keyboard** is Reception. What you type goes into the real question box and presses the 3D keys;
  the answer prints out of a tiny printer on the model's counter as a slip with its first two
  quotations, the builder whose README answered stands, and the camera goes to their desk with the line
  marked. A refusal prints a refusal and moves nothing.
- **The sticky note** carries the grid's current half-hour in the same Caveat hand (OFL, self-hosted in
  `public/fonts/caveat`), with the NESO credit as a slip stuck under it.

`?style=classic` shows the study-model room above; the flat office is unchanged. Assets are the CC0
packs recorded in `public/assets/3d/SOURCES.json`.

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

**The room** (`src/scene/`, `src/room/`). A 1:50 study model in Three.js on a sheet of paper, under a
work lamp, with a soft key light on the cabinet. Both lamps' light and shadows on the floor and the paper
are baked ahead of time by ray tracing the plan (`npm run bake`); figures, sheets, screens, the
cabinet's drawers and box faces are lit live, with soft contact shadows under the figures. The figures
(`people.ts`) are slim, faceless scale figures built from capsules between joints: one seated at each
desk, the reviewer standing; the builder at work only turns a little. The replay moves the work
(`work.ts`): each tool's sheet has its own place on the review table, so sheets never pile up. With
reduced motion nothing travels and the room shows the end of the build. Every screen plays its tool
from one video atlas.

The view from the door is low and a little right of the doorway, so the cabinet sits near and large in
the left third. Every object is a real button or link placed over the model, so Tab reaches each one and
Enter opens it: the cabinet, Reception, the sign, the radio and each desk from the door; each drawer (a
button lying over its front) and the folders in an open drawer at the cabinet. Tags are small printed
labels in Plex Sans Condensed set on the floor, a counter's front or a desk's front corner; for each
desk the engine picks the first spot that covers no monitor at the current size. At a desk, the
camera takes the builder's place (that figure steps out of the picture), and the tool's own loop is
mapped onto the monitor's four corners as the camera sees them (`quad.ts`), with the folder beside it.
Before the scene is ready the room shows a still of itself from the door (`npm run stills`).

**The grid.** One request, when the page opens and after each half-hour, to the NESO Carbon Intensity
API (`/intensity`, no key, CC BY 4.0) for the current national half-hour. The reading is validated
(`src/room/grid.ts`), banded as Grid Weather bands it, and shown on the sign with its half-hour and
source, printed on the sign in the scene (set in Plex on a canvas texture) and in its card; the lamps
warm and dim as carbon rises. A failed call, a malformed response or a half-hour
that is not current shows "Grid data unavailable" and leaves the light neutral; a reading is never shown
past its half-hour, and nothing is invented or cached as current.

**Reception.** ask-the-record's `highlight` attribute names the folder's README box, which shows the
tool's README as numbered source lines (ask-the-record's own `renderSourceView`, written to
`public/record/lines.json` by `npm run record:ask`, each line with `data-record-line`). When an answer
quotes a README, that README goes into the folder before the element marks the line, then the camera
turns to the desk and the folder opens scrolled to it. A refusal says so and moves nothing.

**Receipt stamps** (`src/room/stamp.ts`). Each folder, in both renderings, shows the tool's latest
stamp from the receipts project: the tool, the short commit, PASSED or FAILED and the result line,
labelled as what the stamp claims. Pressing it fetches the signed envelope and runs the receipts
project's own `verifyStamp` (WebCrypto Ed25519, the key pinned to `e201c249…`) in the browser. While it
runs the stamp says so; only when it resolves does it show the outcome, as two separate facts: whether
the signature is valid, and whether the checks passed. Then come the signed statement's commands, exit
codes, times and how they were captured, and the exact signed text. dreaming's stamp is validly signed
and records a failed unit-test run, with the reason and its separately signed supplement (run outside
the sandbox, not network-isolated). Earlier captures are listed and check too. gpt-in-a-tab's folder
can change one byte (the shipped tampered copy) to show the signature failing. A browser without
Ed25519 is told it cannot verify. What a stamp proves, and what it does not, is at `/stamps.html`, from
the receipts project's own `docs/site-stamps.md`. The packet is vendored unmodified by
`npm run vendor stamps` from receipts commit `0f84c7e`, recorded with file hashes in
`public/vendor/stamps/SOURCE.json`.

**Identity.** [IDENTITY.md](IDENTITY.md): one office building; IBM Plex throughout; putty steel, manila,
black felt and green wayfinding signs in the office; the studio is an architect's study model, in
stone, balsa and card on pale paper.

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
npm run perf        # paint, scene ready, bytes, layout shift, frame times (shots/office-4/performance.json)
node scripts/moment-shots.mjs   # the busiest replay moment, before (office-3 build on :4401) and after
```

Automation is silent and offline from the world: every browser gets a device-free `AudioContext`
(`scripts/silent.mjs`), the Carbon Intensity API is always mocked, and any request off the machine fails
the check.

- **Unit tests (Vitest, 69):**
  - no employer or client named in the CV, the pieces or the page, checked against the denylist kept
    outside every repository (`~/Personal/.site-gate/denylist.txt`; skipped where it is absent, a hit
    reported by its line, never by name); the browser suite checks the served CV the same way;
  - the window: the `/generation` mix for the current half-hour only (old, wrong-length, out-of-range
    and wind-or-solar-less mixes refused; HTTP errors explicit); the time of day by hour; the turbines'
    pace from the wind share (slow at none, full at 60% and over), the glint at a fifth solar by day and
    never at night, and stillness without a reading; the shelf's sources each once, each naming tools
    that exist;
  - the index along the desk's foot: every tool once as a real link, in drawer order;
  - Reception's printout: an answer's first two quotations with their sections, a long one shortened
    with the cut marked, a refusal with its reason, and nothing printed for a result it cannot read;
  - the scale figures: about 1.75 m standing and 1.4 m seated, and at every 0.1 s step of both the
    real and the placeholder replay, no two figures' bounding boxes intersect and no part of any figure
    intersects any piece of furniture (contact within 2 mm counts as sitting or resting, not
    overlapping), with a control proving the check catches a figure pushed into its desk;
  - the receipt stamps, with their own verifier: the pinned key matches the reported fingerprint;
    every tool's latest stamp and every earlier capture verifies and names its tool and commit;
    dreaming is validly signed with failed checks, and its supplement is validly signed and marked not
    network-isolated; the tampered copy and a stamp under another key are rejected;
  - the screen overlay's transform landing exactly on a keystoned monitor's corners;
  - the grid: bands, measured value over forecast, refusing old, future, malformed and empty
    half-hours, HTTP errors, expiry, a sign that never shows a number when data is unavailable, and
    the light;
  - the room's tags: only the cabinet, Reception and the credit at rest, every object a tabbable link
    or button, and each drawer followed by its folders;
  - the earlier suites: the timeline, replay, rendering, config, CV, filing, cabinet and floor plan.
- **Browser checks (72 per browser, all passing in Chromium, WebKit and Firefox on 5 November):**
  - lettering (`scripts/desk-checks.mjs`): the nameplate's, card's and credit's printed faces fully in
    sight from the seat (sight lines to a grid on each); a plain board stood in front of the nameplate
    hides its words completely (no dark pixels of them left in its place); no DOM text over the scene
    seated, standing in the room, in the office or at a desk, but the floating tags, notes, bubbles,
    panels, index and buttons; the page's hidden copies of the name, role, intro, door plate and credit
    with the configured hrefs, clipped rather than removed; Tab from the name rings each printed card
    link in turn (the ring seen in the pixels), and a click on a printed link clicks the real one; the
    index box clear of the nameplate at six window shapes; without WebGL the plate engraved in the
    poster;
  - the desk (`scripts/desk-checks.mjs`): it opens at real scale in tilt-shift with the credit on the
    note and zero layout shift; the swoop starts high and lands low (under 30°), still high part-way;
    Esc, the button and the wheel rise out; a card pull by keyboard reaches its desk square-on (within 3°),
    the loop playing exactly over the screen at a readable size, Open under the bezel and reachable by
    Shift+Tab, and no second copy of the loop in the card; no name tag covers a screen, another tag or a
    painted zone name, and every screen is in view; the notebook's V3 page replays V3; typing at
    Reception presses one key per character and an answer prints its quotes before the desk opens with
    the line marked; a refusal prints a refusal; reduced motion cuts and nobody waves;
  - the door (`scripts/door-checks.mjs`): a fresh visit lands outside it with the plate's text, title
    unchanged, and Knock opens it (mid-walk the door is open and the camera walking) and sits at the
    desk 6 to 14 s after the knock (the knock and the voice take about four), with focus on the name, no
    layout shift and no audio device; the walk itself, timed in the page, takes 6 to 7.5 s (6.6 s by design); the seated frame
    after the walk matches the desk loaded directly (mean difference and share of pixels that differ
    much both under 1%), and at three samples of the walk (on the threshold, mid-room, near the desk)
    the scene holds the real desk and no stand-ins; Come in before the desk has loaded says
    Opening… and waits; Skip and Esc go straight in before the knock, mid-knock and mid-walk (the walk
    dropped, focus on the name); a reload starts at the door again and Back from the CV restores the desk; deep links
    skip it and the CV has none; reduced motion cuts; without WebGL it is the poster with the plate as
    text and Come in a link to the content; on a phone it is a hero above the page, no sideways scroll;
  - the knock: two hits 180 ms apart and the voice scheduled after them, nothing touching audio before
    the click (no AudioContext made); muted (and still muted after a reload) the words show on the same
    beat with no audio at all; Skip works mid-knock; with reduced motion the knock and the words stay,
    the door neither jolts nor swings, and it cuts in;
  - the ultrawide: seen whole and in sight (no wall or door in the way) at some point of the walk in; seated, its bottom edge in the top quarter
    of the view and its top above it, a session row at least 9 px tall; every line authored (a mark and
    a tool's hand-off) and the last one word for word the caption's event; held still, never redrawn;
  - the office: with the mocked grid (wind 38%, solar 4%) the turbines turn at exactly that pace and
    the panels do not glint, and the window shows the hour's time of day; without the grid it is still;
    The room stands up to the back wall with "Sit back down" as the way back; a spine under the pointer
    names its source and the tool it fed (three books checked, the first word for word) and goes when the
    pointer leaves the shelf; the shelf's tag opens the list of all 18 by keyboard, Esc gives focus back;
    the shelf's radio opens the radio's card; back down, and no layout shift throughout;
  - the mic: click or Enter opens the card and lights the lamp; its three links are the configured email,
    LinkedIn and CV, each focusable; Copy puts exactly the email on a (mocked) clipboard; Esc and a click
    away close it and the lamp goes off; `getUserMedia` is never called;
  - the stamps' ink: none while the check is held, then PASSED, NOT VALID for the one-byte change, and
    FAILED for dreaming beside its valid signature;
  - the HTML before scripts;
  - the first screen (directory and poster), a clean console and zero layout shift;
  - by keyboard, cabinet → drawer → folder → the desk turn → Esc back, step by step, with focus
    following;
  - Tab reaching every object at the door;
  - the pointer picking the cabinet, a drawer and a folder, and a desk (its tag showing on hover);
  - Reception's answer turning to gridtop's desk with the quoted line (790) marked and on screen, and
    Esc returning to Reception;
  - a refusal moving nothing;
  - **new:** at rest no label covers a monitor, only the cabinet, Reception and the credit are
    labelled, and every desk's tag, when shown by focus, covers no monitor either;
  - **new:** the grid credit visible at rest;
  - **new:** every card (the sign's, the radio's, Reception and the folder) fully inside the viewport
    at 1440 × 900 and 1280 × 720, and on the phone the sign, radio and folder fitting the screen with
    the credit shown;
  - the sign showing the mocked half-hour and source with the light following it, and the failure
    state with a neutral light;
  - the radio making no audio context until pressed, only device-free ones after, a visible on state,
    the credit beside it, and stopping on leaving;
  - deep links, the directory and the replay;
  - the fallback without WebGL;
  - **stamps:** a real stamp verifies in the browser, with the page checked while the check is held
    open to show that nothing says verified before it resolves; the one-byte change is rejected with
    nothing shown as fact; dreaming shows a valid signature, failed checks with the reason, its
    supplement and an earlier capture checking; a browser without Ed25519 is told it cannot verify;
    and the flat office's folder carries the same stamp on a phone;
  - the flat office: phone, reduced motion and `?flat` with no canvas and no poster download, the
    cabinet, folders, Reception's marked line, sign and radio, tabs, plan, and zero layout shift on the
    phone.

## Measured

Production build on loopback, 1440 × 900 at 2× and 390 × 844 at 3×, three cold runs per browser, on a
shared machine (`shots/office-4/performance.json`). Medians:

|                                  | Chromium | WebKit | Firefox |
| -------------------------------- | -------- | ------ | ------- |
| First contentful paint (desktop) | 40 ms    | 33 ms  | 36 ms   |
| Scene ready (desktop)            | 102 ms   | 136 ms | 128 ms  |
| Transferred at scene ready       | 556 KB   | 412 KB | 544 KB  |
| First contentful paint (phone)   | 52 ms    | 38 ms  | 36 ms   |
| Transferred on the phone         | 160 KB   | 159 KB | 160 KB  |
| Layout shift (desktop, phone)    | 0, 0     | n/a    | n/a     |

**The desk and its office (this branch, 5 November).** Chromium at 1440 × 900 and 2×, the branch's
production build on loopback: 2.65 MB transferred by the time the desk is live (the furnished office
adds the kit's coat stand, 14 KB, and its own code; the radio and plants share one fetch with the
model's), within the 3 MB budget. Frame times 16.7 / 16.7 ms (median / 95th) at the
door, through the knock and the walk, seated, standing up and looking round the room, with no frame
over 20 ms. The window's view, the whiteboard and the spines are canvas textures drawn once (the view
again only when the hour's light changes); the radiator's fins are one instanced mesh.

Frame times (median / 95th percentile): Chromium, vsync-locked, 16.7 / 16.8 ms at the door, walking
to the cabinet, opening a drawer and turning to a desk, with no frame over 20 ms in any run. Headless
WebKit and Firefox run their frames unthrottled at about 6 / 7 ms, which shows headroom, not what a
display would pace. WebKit and Firefox do not report layout shift; it is measured in Chromium.

## What is weak

- **The desk's things are small against the room.** The desk view is a seated person's eyes on a
  tabletop of miniatures, so the cabinet, keyboard and model are smaller than life; from the doorway
  and the room view they read as a small cluster on a long desk.
- **Seated, the room is out of sight.** At this scale the desk fills the seated view to its edges, so
  the window, shelf and whiteboard show on the walk in and from The room, not behind the desk.

- **Loopback numbers.** Paint and scene-ready times are from a local preview; over a network the
  three.js chunk (142 KB gzipped) and the baked textures add their transfer time.
- **The poster is one framing.** It is shot at the hall's shape on a laptop; on much wider screens the
  live room frames slightly differently from the still it fades in over.
- **At a desk, its builder steps out of the picture.** The camera takes the builder's place to see the
  whole screen over the desk; the other figures stay.
- **Tags choose their spot per size.** At unusual window shapes a desk's tag may land on the floor
  before its chair rather than on the desk's corner; the check covers 1440 × 900 and 1280 × 720.
- **The printed sign is small from the door.** The number reads; the detail is in its card.
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
CC BY 4.0, credited at rest beside the sign and the radio, on the printed sign and in both cards. Everything else third-party (three.js, Valibot,
xterm.js, the vendored radio and the zod inside it, ask-the-record, transformers.js, ONNX Runtime Web,
all-MiniLM-L6-v2, IBM Plex) is listed with its licence in [public/NOTICES.txt](public/NOTICES.txt),
served at `/NOTICES.txt`. `npm run licences` checks every installed package is MIT, Apache-2.0, BSD or
ISC (the fonts aside) and that the vendored radio carries its MIT licence and source record. Vite is
pinned to 7.3.7 because Vite 8 brings in lightningcss, which is MPL-2.0. Nothing here is hosted or
published.
