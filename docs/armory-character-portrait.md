# Armory: Character Portrait

The Armory presents the active six-slot loadout alongside an optional **vertical 2:3 RPG character portrait**. It depicts an original adventurer physically wearing/holding the equipped items, not a collage of their icons.

## User experience

- A **Generate Portrait** button is available only when at least one usable artifact is equipped.
- Loading the Armory, switching inventory filters, and equipping or removing items **never start an AI image request**.
- A finished portrait is retained in SQLite and served only to the authenticated owner. The preview is expandable.
- Changing gear, item details, appearance settings or the saved face reference marks the previous image **outdated**; regeneration is an explicit button action and the old picture remains visible until replacement succeeds.
- Multiple clicks during the same render are rejected. On server restart an interrupted job becomes retryable.
- `Never` in Visual Self-Insert generates an anonymous avatar without personal likeness; `Auto`/`Prefer` may include the owner's reference photo and textual appearance description.

## Inputs and generation

- The server selects up to one genuinely equipped, non-broken artifact per slot, in order: **Head, Body, Legs, Primary, Secondary, Accessory**. No inventory items are automatically equipped.
- Each selected item contributes its real name, slot, rarity, type, description, and existing image art prompt.
- Where artifact illustrations are locally available inside `/uploads/ai-images`, up to six are embedded as actual image-edit references. The image paths are strictly local and validated; the server does not fetch arbitrary web URLs.
- When authorized and saved, the account owner's *private* face photo is the first image reference. Item images are numbered after it; the prompt identifies exactly which attached image belongs in which equipment slot.
- The model is instructed to depict **ONE full-body RPG character** with recognizable equipment, a readable face, a coherent art style, realistic placement by slot, and no labels, panels, or inventory collage.
- CLIProxyAPI GPT Image model requests use `/images/edits` with `images: [{image_url: ...}, ...]`. Actual support for several references depends on the selected gateway/model. If the edit endpoint explicitly rejects a request as unsupported, one text-only generation is attempted with an accurate, reference-free fallback prompt. Transient server failures are not retried as a second paid call.
- NanoGPT currently renders the portrait using text prompts only, without uploading the actual face and gear reference images.

## Privacy, persistence and lifecycle

- `armory_portraits` stores the final image as a **private SQLite BLOB**, not a public `/uploads` path. Only authenticated `GET /api/armory/portrait/image` can read the bytes.
- The public UI receives only status, age/staleness and an authenticated binary response converted into a browser object URL.
- Image generation writes directly to private data-URL output, avoiding a transient public image file.
- The snapshot identity is based on all equipped gear fields, text appearance, face-photo revision and owner appearance opt-in. Changing any of these makes the existing portrait stale.
- The SQLite DB backup includes the private portrait and the user face-photo reference. Submitting a portrait to the configured image provider discloses that face and equipped item illustrations to that provider; users should review its data-handling policy.
- `GET` requests are read-only and do not call the image generator. Only the explicit `POST /api/armory/portrait/generate` schedules a job.
- Render status and errors survive page reloads. Failed/restarted jobs keep the last successful artwork.

## Testing

`node --import tsx --test src/lib/armoryPortrait.test.ts server/services/armoryPortrait.test.ts server/services/armoryImagePipeline.test.ts`

`npm run build`
