# Image canvas aspect ratios

Boss and loot image dimensions are determined by the UI surface, not by the old single global-resolution field:

| Art | Ratio | CLIProxyAPI/GPT size | NanoGPT requested size | Main UI frame |
|---|---|---|---|---|
| World Boss / Enemy | 3:2 landscape | 1536x1024 | 1152x768 | `aspect-[3/2]` |
| Artifact / Loot | 1:1 square | 1024x1024 | 1024x1024 | `aspect-square` |

The shared helper `src/lib/imageFraming.ts` defines the sizes and appends a strong, composition-aware instruction directly before image generation. This also applies when regenerating images whose original prompts were saved before the change. Boss and loot prompt writers also explicitly request the correct layout. The framing is not dependent on a specific chosen text model.

Actual returned image dimensions are inspected. A wrong aspect ratio triggers a diagnostics/server warning, not an automatic costly retry. The `GeneratedImage` component uses `object-contain` to show legacy portrait artwork without destructive cropping.

`system_settings.imageSize` is retained for legacy compatibility but intentionally does not override these two feature-specific ratios. The Settings page and image-model capabilities endpoint report the actual requested sizes. Image providers may still ignore unsupported dimensions or composition guidance; run a real generation to verify.

Test: `npm run test:image-framing`. Run `npm run lint` and `npm run build` as part of full project verification.
