# Content

Everything Pip says that is presented as fact lives here, as JSON, with its sources.
The app ships these files; nothing factual is hard-coded in components.

## Postcards (`postcards/<route>/<id>.json`)

| Field | Rule |
|---|---|
| `id` | Same as the file name |
| `message` | Pip's voice, first person, 60 words or fewer |
| `field_find` | One animal, plant or human-made wonder tied to the place |
| `alt` | A description of the illustration for screen readers |
| `sources` | At least one named source with a URL and what it supports |
| `review.status` | `pending` until a reviewer checks every fact, then `approved` with a name and date |

Check content with:

```bash
python tools/validate_content.py          # reports problems, fails on hard errors
python tools/validate_content.py --strict # release mode: every card must be sourced and approved
```

`umngot.json` deliberately has no sources yet, so the validator flags it. Finding and checking sources is part of the content track.
