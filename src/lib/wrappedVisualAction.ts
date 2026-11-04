import type { WrappedVisualPlan } from "./dynamicScenes";
import {
  normalizeVisualSelfDescription, normalizeVisualSelfMode,
  type VisualSelfProfile,
} from "./visualSelf";

const cameraInstructions: Record<WrappedVisualPlan["camera"], string> = {
  wide: "Wide environmental frame: show bodies, setting and spatial relationships, not only a face.",
  tracking: "Tracking-shot feeling: clear movement, direction and environmental motion cues.",
  "low-angle": "Dramatic low-angle staging: expressive full-body gesture and depth.",
  "over-shoulder": "Over-the-shoulder participation: show what the subject is engaging with.",
  aerial: "Elevated or aerial view: the subject is part of an active larger environment.",
  "close-up": "Intimate close-up ONLY for an expressive physical interaction, not an idle face.",
  medium: "Medium action shot: hands and torso visibly doing something, not a static bust.",
};

/**
 * Render only the validated, non-private visual plan. The user's likeness and
 * identity instructions are added separately and redacted from diagnostics.
 * An image metaphor must never be treated as a factual gameplay log.
 */
export function wrappedActionImageGuidance(
  plan?: WrappedVisualPlan | null,
  profile?: VisualSelfProfile | null,
  featuredWork?: string | null,
): string {
  const hasOptedIn = normalizeVisualSelfMode(profile?.visualSelfInsertMode) !== "never" &&
    !!normalizeVisualSelfDescription(profile?.visualSelfDescription);
  const world = featuredWork?.trim();
  const shared = [
    "ACTIVE STORYTELLING: Avoid the recurring stock portrait of a solitary thoughtful man, seated with book, pen or notebook, chin on hand, staring wistfully into the distance. Do not default to a static chest-up pose. If a person appears, give them a purposeful, readable physical action or meaningful interaction unless this exact beat calls for reflection.",
    "One coherent situation can involve a SMALL GROUP interacting with each other. One central action or encounter matters more than one isolated hero; avoid collage, cast lineup, disconnected franchise mashups or arbitrary spectators.",
    "This is an IMAGINED visual embodiment of recorded media interest. It is never evidence that the account owner physically entered a fictional world, completed a mission, met a canonical character or attended an unlogged gathering. Keep the image spoiler-conscious.",
  ];
  if (!plan) return shared.join("\n");

  const subject =
    plan.castMode === "environment"
      ? "Environment is the protagonist. Show a distinctive physical event or spatial interaction, not a token human portrait."
      : plan.castMode === "canon-character"
        ? "A canon protagonist or source character may lead this fictional composition when the chosen work supports one; do not invent a named character or specific plot scene. Do not force an account-owner likeness."
        : !hasOptedIn
          ? "No account-owner likeness is authorized. Instead use an anonymous in-world participant or source-appropriate character if useful, or make the environment central. Do not describe or resemble the account owner."
          : plan.castMode === "in-world-self" && world
            ? 'The account owner may appear as a FICTIONAL in-world counterpart within "' + world +
              '" wearing its appropriate clothes, equipment or class silhouette, while keeping the provided personal appearance as a loose identity reference. This is NOT a claim that the user is literally the canonical protagonist.'
            : plan.castMode === "in-world-self"
              ? "No single verified media world is anchored here. Depict the owner in one cohesive symbolic environment rather than inventing a recognizable franchise or identity."
              : "The account owner may be the visible participant, actively doing the pictured action rather than posing for an illustration.";
  const mode = plan.activityMode === "reflection"
    ? "A rare deliberate reflective moment is permitted, but use distinctive context and a non-generic composition instead of chin-on-hand desk portrait."
    : plan.activityMode === "social"
      ? "Show reciprocal social activity and expressive gestures between participants, not everyone staring at the camera."
      : plan.activityMode === "environmental"
        ? "Make the scene's environment or a material transformation visibly active."
        : "Prioritize kinetic, scene-specific action and a readable relationship between subject and surroundings.";
  return [
    "APPROVED VISUAL BEAT, priority above generic editorial mood:",
    "Visible action: " + plan.action + ".",
    plan.interaction ? "Meaningful interaction/companion/object: " + plan.interaction + "." : "",
    "Activity mode: " + plan.activityMode + ". " + mode,
    "Casting: " + plan.castMode + ". " + subject,
    "Camera: " + plan.camera + ". " + cameraInstructions[plan.camera],
    world ? 'Single featured source world: "' + world + '". Translate its artistic language and setting into this imagined scene; avoid unsupported plot specifics.' : "",
    ...shared,
  ].filter(Boolean).join("\n");
}
