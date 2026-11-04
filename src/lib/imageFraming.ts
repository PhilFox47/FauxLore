/** Image canvases for generated UI artwork. Keep geometry and composition together. */
export type ImageFrame = 'square' | 'landscape-3:2' | 'portrait-2:3';
export type ImageProvider = 'nanoGpt' | 'cliProxy';

const FRAME_SIZES: Record<ImageFrame, Record<ImageProvider, string>> = {
  square: { nanoGpt: '1024x1024', cliProxy: '1024x1024' },
  'landscape-3:2': { nanoGpt: '1152x768', cliProxy: '1536x1024' },
  'portrait-2:3': { nanoGpt: '768x1152', cliProxy: '1024x1536' },
};

const FRAME_GUIDANCE: Record<ImageFrame, string> = {
  square: 'Create a SQUARE 1:1 image, equal width and height, composed specifically for a square inventory-art card. Place the SINGLE main object in the center with clear breathing room on all four sides; its complete silhouette and details must remain inside the canvas. A tall, vertical poster composition is incorrect. No artificial borders or letterboxing.',
  'landscape-3:2': 'Create a HORIZONTAL LANDSCAPE image with an exact 3:2 width-to-height aspect ratio, composed specifically for a wide enemy-art card. Use the horizontal space for the setting and action, with the essential subject, face, limbs and equipment safely inside the canvas and comfortable margins. A tall, vertical portrait or poster composition is incorrect. No artificial borders or letterboxing.',
  'portrait-2:3': 'Create a VERTICAL 2:3 full-body RPG character portrait, from head to boots including any equipped weapons. Clear readable face, full gear silhouettes and comfortable margins. No cropped head, hands, legs or equipment. No letterboxing or horizontal canvas.',
};

/** Requested pixel geometry: GPT has fixed supported sizes; NanoGPT uses matching native ratios. */
export function imageFrameSize(frame: ImageFrame, provider: ImageProvider): string {
  return FRAME_SIZES[frame][provider];
}

/** Applied immediately before sending the image request, including saved/legacy prompts. */
export function withImageFrame(prompt: string, frame: ImageFrame): string {
  const clean = prompt.trim();
  // Calling it twice must not pile up conflicting composition blocks.
  if (clean.includes('CANVAS FORMAT REQUIREMENT:')) return clean;
  return `${clean}\n\nCANVAS FORMAT REQUIREMENT: ${FRAME_GUIDANCE[frame]}`;
}

/** A wrong-orientation response is observable, even when the provider ignores size. */
export function imageFrameMatches(frame: ImageFrame, width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
  const ratio = width / height;
  return frame === 'square' ? Math.abs(ratio - 1) <= 0.02
    : frame === 'landscape-3:2' ? Math.abs(ratio - 1.5) <= 0.035
    : Math.abs(ratio - 2 / 3) <= 0.035;
}
