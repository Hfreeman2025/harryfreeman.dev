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
the source of truth; display facts from it, not from this table.

| Tool                 | Commit    | Captured result | Unit tests                                     |
| -------------------- | --------- | --------------- | ---------------------------------------------- |
| gpt-in-a-tab         | `193619e` | passed          | 48 passed                                      |
| real-or-hallucinated | `afe6065` | passed          | 61 passed                                      |
| agent-race           | `e9871e8` | passed          | 76 passed (see below)                          |
| receipts             | `5c8b8fb` | passed          | 530 passed (see below)                         |
| dreaming             | `070b67d` | failed          | 1 failed, 455 passed, 1 skipped (see below)    |
| grid-weather         | `1f3a0f7` | passed          | 54 passed                                      |
| gridtop              | `b70bbf9` | passed          | 73 passed in 16 test binaries (see below)      |
| listen-to-the-grid   | `cd66469` | passed          | 183 passed                                     |
| ask-the-record       | `138597c` | passed          | 389 passed                                     |
| sourced              | `969411a` | passed          | 90 passed                                      |

Each row is the tool's most recent capture. Earlier captures remain signed in
`history` and are referenced from the latest statement:

- **agent-race:** at `647ea41` a unit test read the sibling receipts checkout,
  which the strict sandbox blocks (signed failure; an earlier-policy capture of
  that commit passed 74 of 74). The fix `e9871e8` gives unit tests an in-checkout
  CLI stub and makes the real receipts integration opt-in. It was captured under
  the unchanged strict policy with no exception, and all three `647ea41`
  captures stay signed and linked.
- **receipts:** a stamp cannot name the commit that contains it. Before signing,
  the signer checked that every change after `5c8b8fb` was inside
  `exports/site-stamps/`, and the statement says so. The earlier `5313dea` stamp
  stays signed and linked.
- **gridtop:** the strict sandbox blocked Xcode's `libxcrun`, so Rust could not
  link (signed failure, 4 November). The current stamp was captured with the one
  authorized policy exception, `xcode-toolchain`. It allows reads under the
  Xcode developer directory and xcrun's lookup cache, with network still denied.
  The statement records the exception and the verifier's reason names it. The
  test count combines the signed summary line with the bounded output tail; the
  signed facts are the exit codes and output digests.
- **dreaming:** at `070b67d` one eval-cli test fails inside the sandbox; the
  captured output shows the eval command exiting 1 instead of 0. The operator
  attributes this to its process audit needing `/bin/ps`, which the sandbox will
  not run. A supplemental capture ran `test/eval-cli.test.ts` outside the sandbox
  and passed 7 of 7. It was **not network-isolated** and does
  not replace the failure. The `2d1f18b` capture (3 failed, 453 passed) stays
  signed; `070b67d` references it.
