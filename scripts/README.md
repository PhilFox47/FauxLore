# scripts/

One-off, archival scripts used during development — data seeders (`fill_*`,
`generate_*flavors*`, `quotes*`), data fixers (`fix_*`, `dedupe_*`,
`filter_*`), and ad-hoc API-exploration probes (`test*`, `src-tests/`,
`app/`). They are **not** part of the running application and are excluded
from the TypeScript build and type-check. Kept for reference only; many were
written against an earlier layout and may need path tweaks before re-running.
