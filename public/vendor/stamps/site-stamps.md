# Site receipts stamps

A stamp authenticates an observer's captured non-browser checks at one exact Git
commit. The signature and the check result are separate facts: a failed or not-run
check has an authentic stamp too. A signature never supplies a missing success.

## What a stamp proves

A stamp that verifies proves that the holder of the pinned project key signed
this exact statement and that no byte of it has changed since. The statement
records that:

- these exact commands (argv) ran on this exact Git commit and tree, in a fresh
  local clone, under the stated capture method and network mode;
- each command ended with this exit code or signal, at these times, writing
  output whose original bytes have this SHA-256 and length;
- the suite status (passed, failed or incomplete) follows from those results;
- the capture file it summarizes has this SHA-256, and these earlier captures of
  the same tool exist, each identified by file and digest.

## What it does not prove

- That the tool is correct, that its tests are meaningful or complete, or that it
  works in a browser, when deployed, or on anyone else's machine.
- That the observer behaved honestly. The same observer captured the results and
  signed them afterwards, using its own clock and a project-local key. There is no
  trusted timestamp, transparency log, revocation or independent witness.
- Anything about uncommitted work, later commits or a deployed version.
- That the checks passed. `valid` means authentic; `checksPassed` is separate.
- Why a check failed. The capture sandbox is stricter than a developer machine, so
  a failure can come from capture policy (a blocked sibling-repository read, a
  blocked Xcode linker library) rather than from the tool. The stamp records the
  result and its output digests, not a diagnosis.

## Packet

The public packet is `exports/site-stamps/`. Its `index.json` routes each tool to a
DSSE envelope, captured JSON and retained history. The index is unsigned routing
metadata. Display identity, commit, commands, outcomes and timestamps from the
authenticated statement, and check `predicate.tool` against the expected folder.

Each tool's stamp in `entries` is its most recent capture by capture time,
whatever its result. A later capture is never chosen or skipped because it
passed or failed. Every earlier capture, passing or failing, is signed separately,
listed under `history` and referenced from the latest statement's
`capture.priorCaptures` by file and SHA-256.

Every tool repository's history was rewritten once before publication, on 6 November
2026, to fix author identity and remove local paths and build scaffolding. Captures made
before then name commit IDs that do not exist publicly. They stay signed and are listed
with `prePublication: true` in `index.json`, and each later stamp says so where it links
to them. The current stamps were captured at the published commits.

## Capture

Capturing and signing are operator steps on macOS, because the sandbox is
`sandbox-exec`. They are not part of `npm test` or CI, and they expect each tool's
repository under `~/Personal/`:

```sh
npm run build
node --disable-sigusr1 scripts/stamps-capture.mjs TOOL [--commit SHA]
node scripts/sign-site-stamps.mjs
```

The capture script writes one immutable file under `captures/`. The signer signs every
capture that has no stamp yet, leaves existing stamps untouched, and regenerates the
index, the pinned verifier and the tamper example.

Only authorized public repositories are cloned, using `git clone --local --no-hardlinks --dissociate SOURCE
.cache/stamps/TOOL` at their observed HEAD. Clone-local origin is removed. No original
repository files are written. The signed source identity is the clone's exact
commit/tree, not uncommitted work or a claim that a later HEAD was checked.

Dependency setup uses the committed `package-lock.json` or `Cargo.lock`, whose exact
SHA-256 is included. `npm ci --ignore-scripts` fetches only locked npm registry
dependencies; install hooks, browser downloads and model downloads are disabled.
Gridtop uses `cargo fetch --locked` from crates.io, with a fresh project-local cargo
cache. Setup runs through an allowlisted loopback CONNECT proxy, closed before checks. Setup and checks have their own argv, exit/signal, times, original output
digests/byte counts and a bounded result line. Setup failures prevent a silent
attempt with missing dependencies: affected checks become explicitly not run.

Typecheck, lint and unit tests run with external networking denied by macOS
`sandbox-exec`; loopback TCP and clone-local Unix IPC are allowed. Writes are confined
to each disposable clone and its fresh isolated cache; private home configuration and the signer key directory are
blocked. TMPDIR and caches stay under `.cache/stamps`. Browser executables are denied.
Vitest gets at most two workers; Node test globs are expanded into argument arrays
with concurrency two; Cargo has two build jobs. No shell text is constructed from
tool output. These are selected non-browser commands, not a complete release gate.

One policy exception exists, and only gridtop may use it (`--xcode-toolchain`;
the capture script refuses the flag for any other tool). Rust links through
`cc`, which runs xcrun, so the strict policy cannot build gridtop. With the
exception, commands may also read and execute files under the selected
developer directory (`xcode-select -p`: xcrun's libxcrun, compilers, linker
and the macOS SDK), and may read and write xcrun's lookup cache
(`DARWIN_USER_TEMP_DIR/xcrun_db*`). Network denial, signal isolation, the
browser block and every other read and write limit are unchanged. The capture
and its signed statement carry `capture.policyExceptions: ["xcode-toolchain"]`
and a note naming the exact paths, and the verifier's reason reports the
exception. Xcode's shared frameworks are not readable. If xcrun's cache lacked
a lookup, it would need xcodebuild, and the build would fail rather than widen
further.

Disk is measured before each installation with a 10 GiB floor and a conservative
5 GiB setup allowance. A live monitor terminates the owned setup process group
before the reserve is crossed. Each clone is removed after capture; the caches
are removed before handoff. Raw output hashes cover the original bytes. Displayed
tails are bounded, best-effort redacted and path-normalized; they are not raw logs.

The first capture policies exposed operator restrictions (Node startup, local
IPC, Cargo's global Git-exclude lookup). Failed captures remain in `history/` and
are signed separately. Later observations link those captures rather than silently
turning them into passes. A later fix commit produces another immutable capture
and stamp; earlier failed results remain available. Dreaming’s separately authorized seven-test process-audit supplement runs outside Seatbelt,
is marked `not-os-isolated`, and links the unchanged failing full-suite stamp. It
does not replace that failure. Root receipts is captured
after the implementation commit; the export commit that contains its stamp is
necessarily later than the commit the stamp names. The signer checks that gap
before signing a new receipts stamp. Every change after the captured commit,
whether committed, staged, unstaged or untracked, must be inside
`exports/site-stamps/`, and the commit must be an ancestor of HEAD. Otherwise
the signer refuses. When the check passes, the statement carries a note saying
so.

## Browser consumer

`verify-stamp.mjs` is dependency-free ESM using WebCrypto Ed25519. It pins SHA-256 of
the raw 32-byte signer key independently of envelope `keyid` hints. It authenticates
the exact DSSE PAE bytes before fatal UTF-8 decoding and application validation.
It never reserializes the statement to verify a signature. All malformed input,
wrong-key, unsupported-API and cryptographic failures return `valid: false` with
a reason, null statement/payload and no assumed check success.

```js
import { verifyStamp, PINNED_KEY_SHA256 } from "./verify-stamp.mjs";
const result = await verifyStamp(envelope, publicKey);
if (!result.valid) {
  status.textContent = result.reason;
} else {
  if (result.statement.predicate.tool !== expectedTool) throw new Error("Wrong tool association");
  status.textContent = result.checksPassed
    ? "Captured checks passed"
    : "Captured checks did not all pass";
  exactStatement.textContent = result.payload; // Exact signed UTF-8, not a reserialized object.
}
```

Vendor the verifier and `public-key.json` through the trusted handoff. Check its
`PINNED_KEY_SHA256` against the separately reported fingerprint. An editable packet
or public key obtained from the same untrusted source as an envelope cannot supply
its own trust. The consumer does not fetch anything automatically. Subject digests
bind the exported capture JSON; compare those file bytes separately when consuming
that material. `tampered.dsse.json` changes one payload byte (exit 0 to 1) while
keeping JSON valid and the signature unchanged; it must be rejected.

## Limits

The custom predicate is `https://receipts.dev/attestation/check-suite/v1`, inside an
in-toto Statement v1 / DSSE envelope, using the same PAE and Ed25519 primitives as
command attestations. It is not a command-attestation predicate or SLSA certification.
The existing `receipts verify FILE` command profile is unchanged; use `verifyStamp`
for this packet. Stamps are signed after capture with the ignored project key
`.receipts/keys/ed25519-private.pem`, which the existing `projectKeys` attestation
path created on the packet's first signing run. Only its public half and SHA-256
fingerprint are exported. Beyond the list above, stamps do not prove a trustworthy
compiler or host, the absence of transient reverted edits, or human acceptance.
