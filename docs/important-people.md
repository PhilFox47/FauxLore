# Other Important People · FauxLore

User-curated, per-account profiles under **Settings → Base Preferences → Other Important People**.

## Profile

Each person has a name, optional comma-separated nicknames, connection to the account owner, free-text shared context, optional visible appearance, and a separate opt-in to **allow their appearance in generated Wrapped illustrations**. Multiple people can be created, edited and deleted independently (maximum 50 per account).

Photos are optional, uploaded only after saving a profile. JPEG, PNG and WebP images up to 4 MB are validated server-side (including image dimensions and magic bytes). The original bytes live only in SQLite, not public uploads; preview, replacement and deletion use authenticated private endpoints. SQLite backups consequently contain these sensitive photos. Only upload images you have permission to use.

## How the AI uses people

- Deep Dive Recaps and Wrapped Story Director receive name, nickname, relationship and context **only for people explicitly mentioned by name or nickname in current-period Notes or Journal Thoughts**.
- Mention matching uses word boundaries so a short nickname does not trigger within a different name; narrative instructions warn that relationships are not evidence of a specific meeting, action, emotion or conversation.
- For Wrapped title and interior image jobs, the server looks for an explicit match in the saved scene and its composition. Environmental-only and canon-character scenes do not inherit private real-person references.
- Only when the profile's **Allow in images** opt-in is active may the image prompt receive appearance text. The binary photo is included solely for explicitly matched people with stored images on compatible CLIProxyAPI GPT Image edit models. The account owner's Self-Insert photo, if separately allowed and appropriate, can be included alongside a person's photo in labeled order.
- For providers without image-edit reference support, the model gets text appearance guidance only. Reference images are never put into generated text prompts, JSON settings, diagnostics, logs, or user-visible API payloads. The image adapter redacts private appearance blocks and reference maps from exportable diagnostics.
- Already generated Recaps and artwork remain unchanged. Future generation or explicit redraw uses updated profiles. Removing a person permanently deletes their stored reference image, but it does not retroactively remove previously generated illustrations.

## Data model

Additive migration creates `important_people` with composite `(userId,id)` primary key, foreign-key cascade on user deletion, and nullable per-profile BLOB and MIME. Authenticated routes: GET/POST `/api/important-people`, PUT/DELETE `/api/important-people/:id`, GET/PUT/DELETE `/api/important-people/:id/photo`.

## Tests

`src/lib/importantPeople.test.ts`: exact name and nickname matching, contextual relevance, image opt-in and diagnostics redaction.

`server/routes/importantPeople.test.ts`: account-scoped profile and photo CRUD, invalid images, private data exclusion and deletion.

`server/services/importantPeopleImage.test.ts`: GPT image edit reference order, opt-out, user isolation, combined self/person imagery.

Workflow: `.github/workflows/important-people.yml` also tests existing Self-Insert and Wrapped image regressions and builds the production app.
