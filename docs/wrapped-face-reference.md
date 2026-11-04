# Wrapped: Private Face Reference Image

A per-account opt-in face photo may supplement the existing Visual Self-Insert text description when rendering original Wrapped images.

## User experience

- Settings → Preferences → Visual Self-Insert offers **Face Reference Image** with upload, private preview, replace and remove.
- Accepted: JPEG, PNG, WebP; maximum upload 4 MiB; image headers must describe dimensions 160–4096 px on both axes.
- **Never** retains the saved reference but never uses it. **Auto / Prefer** may use it only for a scene explicitly staged as `self` or `in-world-self`.
- The description remains editable and continues to work even when there is no photo or the provider lacks edit support.
- A restyle/regeneration is required for an already generated Wrapped image to change; existing images remain untouched.

## Private data and processing

- The binary is stored in the `visual_self_references` SQLite table, scoped by `userId`, with an account foreign key. It is included in backups of the local SQLite database. It is **not** in `/uploads`, the public static folder, the normal settings JSON, story evidence, prompt diagnostics, or any publicly accessible photo URL.
- Only authenticated `GET/PUT/DELETE /api/settings/visual-reference` can access it. GET responses use `private, no-store` and `nosniff`. The browser displays a locally created Object URL from the authenticated binary response and revokes it when replaced/unmounted.
- The content type is checked against supported image header bytes and dimensions. No SVG or remote URL input is accepted.
- The image generation service looks up the reference again for the requesting user; reference bytes never pass through the browser's LLM story-writing requests.
- **A real photograph is personal data.** When the user elects to render themselves with an image provider, the photo is transmitted in an authenticated image-edit request to that configured image provider. Users should consider the chosen provider's data-handling policy. An uploaded image is not sent to narrative, journal, Codex, evidence, or normal text models.

## Rendering

- The Visual Director can choose `self`, `in-world-self`, `canon-character`, or `environment` casting.
- Only the first two can request a face reference, and only with an actual stored photo and Auto/Prefer enabled. Neither the achievement finale nor canon/environment art receives it. Existing stories without a valid casting plan continue text-only; restyle them to make intentional use of a photo.
- For a CLIProxyAPI GPT Image model, a self scene uses the existing `/images/edits` request with `images:[{image_url:"data:image/...;base64,..."}]` and a prompt telling the model to use **facial identity only**, while changing art style, clothing, pose, and setting.
- The `gpt-image-2.5`-specific delivery prompt is still used where applicable. A `gpt-image-*` model can be attempted on the edit route, but actual support is gateway/model-dependent.
- If the edit endpoint explicitly reports an unsupported request (HTTP 400/404/405/415/422/501), the established text-only generator is used instead. Transient errors or timeouts are not retried as a second paid image request.
- NanoGPT's current text-only image-generation route does not receive the photo. The UI explains this rather than claiming the reference was used.
- No reference bytes are included in diagnostics: image payload logging redacts `images` before serialization.

## Verification

`node --import tsx --test server/lib/visualSelfReference.test.ts server/routes/settings.reference.test.ts server/services/wrappedCovers.test.ts`

`npm run build`
