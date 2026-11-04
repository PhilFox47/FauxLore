import type {
  WrappedVisualPlan, WrappedCamera, WrappedVisualArchetype,
  WrappedSettingFamily, WrappedPropStrategy,
} from "./dynamicScenes";
import type { StoryScene } from "./storyDiscovery";

/**
 * Pure visual continuity editor. Never changes the editorial story, media IDs,
 * factual claims or onscreen text. A director's valid composition remains the
 * source of truth; this only resolves a repetitive composition and adds a
 * backstop for older stories where the AI layout was invalid or missing.
 */
type ArtScene = Pick<StoryScene, "id" | "kind" | "title" | "body" | "design" |
  "editorialJob" | "composition">;

const CAMERA_CYCLE: WrappedCamera[] = [
  "wide", "over-shoulder", "tracking", "low-angle", "aerial", "medium", "close-up",
];

const ARCHETYPES: Record<WrappedSettingFamily, WrappedVisualArchetype[]> = {
  train: ["travel-observation", "environmental-stillness", "quiet-aftermath", "kinetic-action"],
  hotel: ["environmental-stillness", "investigative-noir", "symbolic-object-tableau", "quiet-aftermath"],
  stage: ["stage-spectacle", "active-task-comedy", "ensemble-interaction", "kinetic-action"],
  corridor: ["investigative-noir", "environmental-stillness", "quiet-aftermath", "kinetic-action"],
  exterior: ["kinetic-action", "environmental-stillness", "travel-observation", "ensemble-interaction"],
  "media-world": ["source-world-moment", "kinetic-action", "investigative-noir", "ensemble-interaction"],
  domestic: ["quiet-aftermath", "environmental-stillness", "ensemble-interaction", "symbolic-object-tableau"],
  abstract: ["symbolic-object-tableau", "environmental-stillness", "quiet-aftermath", "investigative-noir"],
  other: ["environmental-stillness", "investigative-noir", "kinetic-action", "quiet-aftermath"],
};
const FAMILY_CAMERA: Partial<Record<WrappedVisualArchetype, WrappedCamera>> = {
  "environmental-stillness": "wide",
  "stage-spectacle": "wide",
  "active-task-comedy": "tracking",
  "travel-observation": "over-shoulder",
  "investigative-noir": "tracking",
  "symbolic-object-tableau": "close-up",
  "ensemble-interaction": "wide",
  "kinetic-action": "low-angle",
  "quiet-aftermath": "aerial",
  "source-world-moment": "low-angle",
};
const familyAction: Record<WrappedSettingFamily, string> = {
  train: "Watch the moving landscape stream past the train window and empty passenger seat",
  hotel: "Follow changing daylight across a temporary room and its quietly shifting shadows",
  stage: "Reveal the theatrical stage transforming under the bright challenge lights",
  corridor: "Follow a thin shaft of light cutting through an otherwise empty passageway",
  exterior: "Follow movement across an open landscape under changing atmospheric light",
  "media-world": "Move through a fictional world with a purposeful dramatic action",
  domestic: "Catch a small environmental transformation in a lived-in room",
  abstract: "Reveal one physical transformation that expresses the chapter's central contrast",
  other: "Reveal the distinctive environment changing in a physically readable way",
};
const strongTabletop = /\b(table(top)?|desk|stack|balanc(e|ing)|tower|construct|assembl|pyramid|make.?shift|rubber duck|egg|mug|pile of objects)\b/i;
const trainWords = /\b(train|railway|railroad|railcar|carriage|platform|window seat|transit|on the rails|zug|bahn|bahnhof)\b/i;
const hotelWords = /\b(hotel|guest room|temporary room|bedside|eindhoven room|suite)\b/i;
const stageWords = /\b(taskmaster|game show|contestants|comedy challenge|stage|theatrical|studio challenge|spotlight)\b/i;
const corridorWords = /\b(corridor|doorway|threshold|hallway|passageway|long shadow)\b/i;
const exteriorWords = /\b(forest|outside|open sky|river|city street|battlefield|mountain|ocean)\b/i;
const sourceWorldWords = /\b(fictional world|source world|quest|dungeon|realm|battle|fantasy)\b/i;

export function inferWrappedSetting(scene: ArtScene): WrappedSettingFamily {
  const plan = scene.composition?.visualPlan;
  if (plan?.settingFamily) return plan.settingFamily;
  const text = [
    scene.composition?.artConcept, plan?.action, plan?.interaction, scene.title, scene.body,
  ].filter(Boolean).join(" ");
  // Places are more specific than media genres. Train log + Taskmaster media
  // should look like train travel, not another contestant at a prop table.
  if (trainWords.test(text)) return "train";
  if (hotelWords.test(text)) return "hotel";
  if (stageWords.test(text)) return "stage";
  if (corridorWords.test(text)) return "corridor";
  if (exteriorWords.test(text)) return "exterior";
  if (sourceWorldWords.test(text)) return "media-world";
  return scene.kind === "opening" || scene.kind === "closing" ? "abstract" : "other";
}

function infographic(scene: ArtScene): boolean {
  return scene.editorialJob === "data-reveal" ||
    scene.design?.layout === "infographic" ||
    ["bars","rings","tiles"].includes(scene.design?.visual || "") ||
    scene.composition?.direction?.presentation === "data" ||
    !!scene.composition?.elements?.some(item => item.type === "stat");
}

function inferProp(scene: ArtScene, setting: WrappedSettingFamily): WrappedPropStrategy {
  const plan = scene.composition?.visualPlan;
  if (plan?.propStrategy) return plan.propStrategy;
  const concept = [scene.composition?.artConcept, plan?.action, plan?.interaction].filter(Boolean).join(" ");
  if (strongTabletop.test(concept)) return "tabletop";
  if (plan?.activityMode === "social") return "group-interaction";
  if (setting === "train" || setting === "hotel" || setting === "corridor" ||
      setting === "exterior") return "environment";
  return "none";
}

function normaliseAction(action: string): string {
  return action.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g," ").trim();
}
const kindSignature = (plan: WrappedVisualPlan): string =>
  [plan.visualArchetype || "", plan.settingFamily || "", plan.propStrategy || "",
    normaliseAction(plan.action)].join("|");

const stopMotifs = [
  "person in a colorful floral shirt leaning into the same right-hand side medium shot",
  "person seated at a table or desk carefully balancing or stacking a tower of small props",
  "the same warm lamplit interior, improvised tabletop contraption and concentrated face",
];

function themeSpecificAvoidance(setting: WrappedSettingFamily): string[] {
  if (setting === "train") return [
    "balancing objects on a table inside the train",
    "another task-show contestant performing a tabletop challenge",
  ];
  if (setting === "stage") return [
    "solitary participant crouched over a table with assorted little objects",
    "the same flowery shirt and right-side close-up used elsewhere",
  ];
  if (setting === "hotel") return [
    "the same dark warm studio stage or small tabletop task setup",
  ];
  return [];
}

function fallbackPlan(scene: ArtScene): WrappedVisualPlan {
  const setting = inferWrappedSetting(scene);
  return {
    activityMode: "environmental",
    castMode: "environment",
    camera: FAMILY_CAMERA[ARCHETYPES[setting][0]] || "wide",
    action: familyAction[setting],
    settingFamily: setting,
    visualArchetype: ARCHETYPES[setting][0],
    propStrategy: "environment",
  };
}

/** With an invalid/missing AI plan, do NOT fall back to a generic self portrait. */
export function stageWrappedVisualSequence<T extends ArtScene>(scenes: T[]): T[] {
  const usedArchetypes = new Map<WrappedVisualArchetype, number>();
  const usedFamilies = new Map<WrappedSettingFamily, number>();
  const priorAction = new Set<string>();
  const priorCameras: WrappedCamera[] = [];
  let ownerLeadCount = 0;
  let reflectiveHumanCount = 0;
  let tabletopCount = 0;
  let previousSignature = "";
  const totalIllustrated = scenes.filter(s => !infographic(s)).length;
  const allowedOwnerLeads = Math.max(2, Math.floor(totalIllustrated * 0.4));

  const output = scenes.map((scene, sceneIndex) => {
    if (infographic(scene)) return scene;
    const comp = scene.composition;
    let plan: WrappedVisualPlan = {...(comp?.visualPlan || fallbackPlan(scene))};
    const setting = inferWrappedSetting(scene);
    plan.settingFamily = setting;
    plan.propStrategy = inferProp(scene, setting);
    const candidates = ARCHETYPES[setting];
    const firstChoice = plan.visualArchetype || candidates[0];
    let archetype = firstChoice;
    if ((usedArchetypes.get(archetype) || 0) > 0) {
      const free = candidates.find(candidate => !usedArchetypes.has(candidate));
      if (free) archetype = free;
    }

    // One tabletop construction can be an excellent Taskmaster image. Three
    // of them make a repeated visual gag. A physically distinct alternative
    // keeps the same chapter fact while changing the visual approach.
    if (plan.propStrategy === "tabletop" && tabletopCount >= 1) {
      plan.propStrategy = "environment";
      plan.activityMode = "environmental";
      plan.castMode = "environment";
      plan.action = familyAction[setting];
      archetype = candidates.find(candidate =>
        candidate !== "active-task-comedy" && !usedArchetypes.has(candidate)) || candidates[0];
    }
    if (plan.propStrategy === "tabletop") tabletopCount++;

    // Owner likeness is opt-in at render time; this cap only discourages
    // repetitive solo portrait staging in the visual plan. Canonical heroes
    // and genuine group tableaux are not subject to it.
    if ((plan.castMode === "self" || plan.castMode === "in-world-self") &&
        ownerLeadCount >= allowedOwnerLeads && plan.activityMode !== "social") {
      plan.castMode = "environment";
      plan.activityMode = "environmental";
      plan.action = familyAction[setting];
    } else if (plan.castMode === "self" || plan.castMode === "in-world-self") ownerLeadCount++;

    if (plan.activityMode === "reflection" && plan.castMode !== "environment") {
      reflectiveHumanCount++;
      if (reflectiveHumanCount > 2) {
        plan.activityMode = "exploration";
        plan.action = familyAction[setting];
      }
    }
    plan.visualArchetype = archetype;

    const prevCamera = priorCameras.at(-1);
    if (plan.camera === prevCamera ||
        ((plan.camera === "medium" || plan.camera === "close-up") &&
          priorCameras.filter(cam => cam === "medium" || cam === "close-up").length >= 2)) {
      const suitable = FAMILY_CAMERA[archetype];
      plan.camera = suitable && suitable !== prevCamera ? suitable
        : CAMERA_CYCLE.find(cam => cam !== prevCamera && cam !== plan.camera) || "wide";
    }

    const signature = kindSignature(plan);
    const actionKey = normaliseAction(plan.action);
    if ((signature === previousSignature || priorAction.has(actionKey)) &&
        plan.activityMode !== "reflection") {
      plan.activityMode = "environmental";
      plan.castMode = "environment";
      plan.action = familyAction[setting];
      plan.propStrategy = "environment";
    }
    // Strong, direct negative examples are stronger than the generic "be
    // creative". Every art-generating path receives the SAME persisted list.
    const bannedMotifs = [
      ...stopMotifs,
      ...themeSpecificAvoidance(setting),
      ...(plan.bannedMotifs || []),
    ];
    if (sceneIndex > 0 && previousSignature) {
      bannedMotifs.push("repeating the preceding scene's combination of setting, action and camera");
    }
    plan.bannedMotifs = [...new Set(bannedMotifs)].slice(0, 8);
    usedArchetypes.set(archetype, (usedArchetypes.get(archetype) || 0) + 1);
    usedFamilies.set(setting, (usedFamilies.get(setting) || 0) + 1);
    priorAction.add(normaliseAction(plan.action));
    priorCameras.push(plan.camera);
    previousSignature = kindSignature(plan);

    const artConcept = comp?.artConcept;
    // A missing plan also needs a concept. Existing creator-approved text is
    // preserved if valid and compatible with the approved scene plan.
    const compatibleConcept = artConcept && !(plan.castMode === "environment" &&
      /\b(man|woman|person|portrait|selfie)\b/i.test(artConcept) &&
      !/\b(empty|no people|no person)\b/i.test(artConcept));
    const nextComposition = {
      ...comp,
      version: 1 as const,
      backdrop: comp?.backdrop || "cinematic" as const,
      elements: comp?.elements || [],
      artConcept: compatibleConcept ? artConcept
        : "An original " + setting.replace("-", " ") + " tableau: " + plan.action,
      visualPlan: plan,
    };
    return { ...scene, composition: nextComposition } as T;
  });

  // The first pass already enforces many constraints. Keep the entire list
  // stable for cover and chapter renderers, even when they start concurrently.
  return output;
}

function conciseSummary(scene: ArtScene, index: number): string {
  const p = scene.composition?.visualPlan;
  if (!p) return "";
  return [
    "Scene " + (index + 1) + " (" + scene.kind + ", " + scene.title.slice(0, 65) + ")",
    "archetype " + (p.visualArchetype || "unspecified"),
    "setting " + (p.settingFamily || "other"),
    "cast " + p.castMode,
    "camera " + p.camera,
    "hero action " + p.action.slice(0, 105),
    p.propStrategy ? "props " + p.propStrategy : "",
  ].filter(Boolean).join(" | ");
}

/**
 * Provide explicit motif memory to the image model. The generator may run
 * independently/concurrently; this visual bible is stable for the whole issue
 * and avoids relying on whichever image finished first.
 */
export function wrappedVisualContinuityBrief(scenes: ArtScene[], sceneId: string): string {
  const eligible = scenes.filter(s => !infographic(s));
  const current = eligible.find(s => s.id === sceneId);
  if (!current) return "";
  const p = current.composition?.visualPlan;
  const index = scenes.findIndex(s => s.id === sceneId);
  if (!p) return "";
  const others = scenes.map((s, i) => ({s,i})).filter(({s}) =>
    s.id !== sceneId && !infographic(s) && !!s.composition?.visualPlan);
  return [
    "SERIAL VISUAL CONTINUITY CONTRACT: This is ONE image in a multi-slide Wrapped, not an independent stock illustration.",
    "CURRENT SLIDE: " + conciseSummary(current, index) + ".",
    "OTHER SCENES ALREADY RESERVED DISTINCT VISUAL IDENTITIES:",
    ...others.map(({s,i}) => " - " + conciseSummary(s, i)),
    "Do NOT borrow another scene's hero action, tabletop setup, wardrobe, setting, focal subject or signature camera composition. Repeating the account owner's face in a different pose is NOT visual variety.",
    "STRICT MOTIF EXCLUSIONS FOR THIS IMAGE:",
    ...(p.bannedMotifs || stopMotifs).map(s => " - " + s),
    p.castMode === "environment"
      ? "HARD CAST RULE: no visible account owner, no person in a patterned shirt, no human performing a challenge. The ENVIRONMENT, light, movement or setting is the protagonist."
      : p.castMode === "canon-character"
        ? "HARD CAST RULE: show source-appropriate character(s), not the account owner's likeness."
        : "The account owner may appear, but do not default to their previously used floral-pattern outfit, side-of-frame portrait or tabletop task. Make the action and physical environment distinctive.",
    p.settingFamily === "train"
      ? "TRAIN MUST LOOK LIKE A TRAIN: make the window, seat, motion and passing landscape legible. Never replace the train with a cozy game-show room."
      : "",
    "Focus on the CURRENT scene's precise physical image. The other scenes are NEGATIVE CONTEXT ONLY: do not literally paint their subjects, combine them, or make a montage.",
  ].filter(Boolean).join("\n");
}
