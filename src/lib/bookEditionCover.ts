/**
 * Hardcover can associate a square audiobook cover with an edition.
 * FauxLore uses the work's portrait cover for audiobooks instead, while
 * printed books keep the specific edition's cover.
 */
export function chooseBookEditionCover(
  mediaType: "Book" | "Audiobook",
  workCoverUrl?: string | null,
  editionCoverUrl?: string | null,
): string {
  if (mediaType === "Audiobook") return workCoverUrl || "";
  return editionCoverUrl || workCoverUrl || "";
}
