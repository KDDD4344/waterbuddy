# Content

Everything Pip says that is presented as fact lives here, as JSON, with its sources.
The app ships these files; nothing factual is hard-coded in components.

## Postcards (`postcards/<route>/<id>.json`)

| Field | Rule |
|---|---|
| `id` | Same as the file name |
| `number` | Order on the route: 1, 2, 3… with no gaps |
| `coordinates` | Like `24.4°N 93.8°E`, from a source where possible |
| `art` | `true` once a painting is in `art/postcards/<id>.png` (then run `tools/build_art.py`); `null` uses the drawn placeholder |
| `scene` | Which drawn placeholder to use until real art lands (`floating-islands`, `clear-river`, `river-island`, `mangroves`, `lagoon`, `backwaters`) |
| `message` | Pip's voice, first person, 60 words or fewer |
| `field_find` | One animal, plant or human-made wonder tied to the place |
| `alt` | A description of the illustration for screen readers |
| `sources` | At least one named source with a URL and what it supports. A card with none is always rejected |
| `review.status` | `pending` until a reviewer checks every fact, then `approved` with a name and date |
| `review.notes` | Optional: anything the reviewer should look at first |

Check content with:

```bash
python tools/validate_content.py          # reports problems, fails on hard errors
python tools/validate_content.py --strict # release mode: every card must be sourced and approved
```

Route I has six cards (Loktak, Umngot, Majuli, Sundarbans, Chilika, Vembanad). Every fact on them was checked against the listed source pages on 10 Nov 2026, but none has a named reviewer yet, so `--strict` fails until a reviewer approves them. The app shows unreviewed cards with a short note under their sources.
