# Screenshots

The images in the main README. They are captured from the **seeded, fictional demo
plans** running on the same fake AI and in-memory database the end-to-end tests
use, so they contain no real data and need no credentials.

| File | Shows |
| --- | --- |
| `01-overview.png` | The operational overview and the first plan card, signed in as the sustainability manager |
| `02-evidence.png` | A plan's actions with their labels: a verified quotation highlighted in its source, and a claim the server downgraded to a proposal because the quotation was not found |
| `03-review-change-request.png` | A reviewer's open change request and the author's response, before resubmitting |

To regenerate them:

```bash
CAPTURE_SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
```

The spec (`e2e/screenshots.spec.ts`) is skipped unless that variable is set, so it
never runs in CI or in `npm run e2e`. The timestamp on the change request in image
03 is the capture time.
