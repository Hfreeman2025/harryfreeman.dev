# The build timeline

The studio replays the build from `~/Personal/site-data/timeline.json`. Until that file exists, it
plays `src/timeline/placeholder.json`, an invented timeline, and says so on the model, in the list and
on every desk card. Set `STUDIO_TIMELINE=/path/to/file.json` to use a file elsewhere.

The file is read when the page is built (and on every request by the development server). It is
validated twice: at build time, where an invalid real file **fails the build** rather than quietly
falling back, and again in the browser before the replay uses it. In development an invalid file
shows an explicit error on the page and plays the placeholder.

## Schema: `studio-timeline/1`

```json
{
  "schema": "studio-timeline/1",
  "placeholder": false,
  "description": "An example: the shape of the file, not real events.",
  "actors": [
    { "id": "harry", "role": "brief", "kind": "person", "label": "Harry, who wrote the briefs" },
    { "id": "lab-race", "role": "builder", "kind": "codex", "label": "Codex, lab-race pane" },
    { "id": "review", "role": "reviewer", "kind": "claude", "label": "Claude, reviewing" }
  ],
  "pieces": [{ "piece": "agent-race", "builder": "lab-race", "reviewer": "review" }],
  "events": [
    { "at": "2026-11-01T09:00:00Z", "piece": "agent-race", "kind": "briefed", "brief": "V2.md" },
    { "at": "2026-11-01T09:04:00Z", "piece": "agent-race", "kind": "started" },
    { "at": "2026-11-01T11:30:00Z", "piece": "agent-race", "kind": "submitted" },
    { "at": "2026-11-01T11:52:00Z", "piece": "agent-race", "kind": "returned", "note": "example: sent back for a missing test" },
    { "at": "2026-11-01T13:10:00Z", "piece": "agent-race", "kind": "submitted" },
    { "at": "2026-11-01T13:25:00Z", "piece": "agent-race", "kind": "accepted" }
  ]
}
```

| Field         | Rule                                                                                                                                                                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema`      | Exactly `studio-timeline/1`.                                                                                                                                                                                                                                               |
| `placeholder` | `true` only for a stand-in. The site labels every number from a placeholder.                                                                                                                                                                                               |
| `description` | One to 400 characters.                                                                                                                                                                                                                                                     |
| `actors[]`    | `id` is lowercase letters, digits and hyphens (up to 40). `role` is `brief`, `builder` or `reviewer`. `kind` is `person`, `claude`, `codex` or `other`. `label` (up to 60 characters) is how the site names the actor; product names appear as plain text. Ids are unique. |
| `pieces[]`    | One entry per piece at most, `piece` one of the ten ids in `src/content/pieces.ts`. `builder` must name an actor whose role is `builder`, `reviewer` one whose role is `reviewer`. A piece may be left out; its desk then says “Not in the timeline”.                      |
| `events[]`    | Up to 2,000, in time order (ties allowed). `at` is ISO 8601 with a zone. `piece` must be in `pieces`. `brief` (optional) names the brief a `briefed` event starts. `note` (optional, up to 160 characters) is one sanitised line.                                          |

Each piece's events must follow the hand-off order:

```
(briefed)* started submitted (returned submitted)* accepted   [then, for the next version: (briefed)* started …]
```

Anything else (a `submitted` before `started`, an `accepted` with nothing submitted, an event out of
order, an unknown actor or piece, an extra field) is rejected with a message naming the event.

## What the site derives

- **Review rounds** for a piece: the number of `submitted` events. **Sent back**: the number of
  `returned` events. **Accepted**: whether its last event is `accepted`.
- **The replay:** real time is compressed so that a gap of a few minutes takes a fraction of a second
  and a night takes under three seconds (`sceneGap` in `src/timeline/replay.ts`), keeping order. Every
  hand-off gets time to be seen: 3.2 s to walk to the review table, at least 1.6 s of review, 2.8 s to
  walk back. The caption shows the real time being replayed, interpolated between events.

## Privacy

Nothing in this file should identify a client, an employer or a private person. Labels name roles and
tools, never people other than Harry. Notes are optional; leave them out rather than paste anything
from a transcript.
