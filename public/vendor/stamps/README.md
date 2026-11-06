# Site stamps packet

Signed results of each portfolio tool's own typecheck, lint and unit-test commands,
captured in a fresh local clone at one exact commit. Read
[what a stamp proves and what it does not](../../docs/site-stamps.md) before
displaying one.

| Path                                         | Contents                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| `verify-stamp.mjs`                           | Dependency-free ESM: `verifyStamp(envelope, publicKey)` using WebCrypto. |
| `public-key.json`, `public-key.pem`          | The pinned Ed25519 signer key (public half only).                         |
| `stamps/*.dsse.json`, `history/*.dsse.json`  | DSSE envelopes, each over one in-toto Statement v1.                       |
| `captures/*.json`, `history/*.json`          | The captured observations; each statement binds one by SHA-256.           |
| `index.json`                                 | Unsigned routing: latest stamp per tool, history and supplemental runs.   |
| `tampered.dsse.json`, `tamper-vector.json`   | One changed payload byte (exit 0 to 1) that must verify as invalid.       |

Signer fingerprint (SHA-256 of the raw 32-byte key), also `PINNED_KEY_SHA256` in
`verify-stamp.mjs`:

```
e201c24958d158d09f607f1951d2440aa3f0ce76061e5a67c0e6bcd7bc4ba023
```

## Latest stamp per tool

An unsigned summary of `index.json` at export time. The authenticated statement is
the source of truth; display facts from it, not from this table. Every row was
captured on 6 November 2026 at the tool's published commit.

| Tool                 | Commit    | Captured result | Unit tests                                     |
| -------------------- | --------- | --------------- | ---------------------------------------------- |
| gpt-in-a-tab         | `4938e51` | passed          | 48 passed                                      |
| real-or-hallucinated | `bac2ea7` | passed          | 65 passed                                      |
| agent-race           | `3fadafb` | passed          | 77 passed                                      |
| receipts             | `1881b07` | passed          | 530 passed (see below)                         |
| dreaming             | `00bec8c` | failed          | 1 failed, 455 passed, 1 skipped (see below)    |
| grid-weather         | `28fc799` | passed          | 53 passed                                      |
| gridtop              | `638c40c` | passed          | 73 passed in 16 test binaries (see below)      |
| listen-to-the-grid   | `857d5d7` | passed          | 183 passed                                     |
| ask-the-record       | `5d58268` | passed          | 389 passed                                     |
| sourced              | `3580b4b` | passed          | 90 passed                                      |

Each row is the tool's most recent capture. Earlier captures remain signed in
`history` and are referenced from the latest statement:

- **Publication rewrite:** before publication, every repository's history was
  rewritten once for author identity and local paths. All 29 earlier stamps name
  commit IDs that do not exist publicly. They stay signed, `index.json` marks them
  `prePublication: true`, and each current stamp says so where it links to them. The
  earlier results include agent-race's strict-sandbox failure, fixed before
  publication, and gridtop's failure before its toolchain exception.
- **receipts:** a stamp cannot name the commit that contains it. Before signing,
  the signer checked that every change after `1881b07` was inside
  `exports/site-stamps/`, and the statement says so.
- **gridtop:** captured with the one authorized policy exception, `xcode-toolchain`.
  It allows reads under the Xcode developer directory and xcrun's lookup cache, with
  network still denied. The statement records the exception and the verifier's reason
  names it. The test count combines the signed summary line with the bounded output
  tail; the signed facts are the exit codes and output digests.
- **dreaming:** one eval-cli test fails inside the sandbox; the captured output shows
  the eval command exiting 1 instead of 0. The operator attributes this to its
  process audit needing `/bin/ps`, which the sandbox will not run. A supplemental
  capture at the same commit ran `test/eval-cli.test.ts` outside the sandbox and
  passed 7 of 7. It was **not network-isolated** and does not replace the failure.
