import React, { useState, useEffect, useRef, useMemo } from "react";
import { MediaItem, MEDIA_TYPES, STATUSES, MediaType } from "../types/schema";
import { X, Search, Loader2, RefreshCw, BrainCircuit, AlertTriangle, ArrowRight } from "lucide-react";
import { IntegrationsService, GameMetadata } from "../services/integrations";
import { findDuplicateMatches } from "../lib/duplicateMatch";
import { cn } from "../lib/utils";
import { useMediaContext } from "../contexts/MediaContext";
import { DatabaseService } from "../services/db";
import { useToast } from "../contexts/ToastContext";
import { format } from "date-fns";

/** Tells the user where the genres and tags went when adding a new entry. */
function AutoTagNotice() {
  return (
    <div className="col-span-1 sm:col-span-2 flex items-start gap-3 rounded-xl border border-purple-500/20 bg-purple-500/[0.07] p-3 mt-2">
      <BrainCircuit className="w-4 h-4 text-purple-300 shrink-0 mt-0.5" />
      <p className="text-xs text-zinc-400 leading-snug">
        <span className="text-purple-200 font-bold">Genres and tags are added automatically.</span>{' '}
        Saving this queues auto-tagging on the server — it keeps running if you close the page, and the
        entry picks up its tags shortly after. You can edit them here once it exists.
      </p>
    </div>
  );
}

/**
 * Franchise input: free-text (comma-separated) with a dropdown of already-known
 * franchises that text-match the token currently being typed.
 */
function FranchiseInput({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const lastComma = value.lastIndexOf(",");
  const before = value.slice(0, lastComma + 1);
  const token = value.slice(lastComma + 1).trim().toLowerCase();
  const already = value.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    return options
      .filter(o => o && o.toLowerCase().includes(token) && !already.includes(o.toLowerCase()))
      .filter(o => { const k = o.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, token, already.join("|")]);

  const pick = (name: string) => {
    const prefix = before ? before.replace(/\s*$/, "") + " " : "";
    onChange(`${prefix}${name}, `);
    setActive(0);
    setOpen(true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(suggestions[active]); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div className="relative" ref={ref}>
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="input-field"
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-30 mt-1 w-full bg-zinc-900 border border-white/10 rounded-xl shadow-2xl max-h-56 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              type="button"
              key={s}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              onMouseEnter={() => setActive(i)}
              className={cn("w-full text-left px-3 py-2 text-sm transition-colors", i === active ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/5")}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface MediaFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    item: Partial<MediaItem> & {
      title: string;
      mediaType: MediaType;
      status: MediaItem["status"];
    },
  ) => void;
  onDelete?: (id: string) => void;
  initialData?: MediaItem;
  /**
   * Opens an entry the duplicate check surfaced. Given this, each match becomes
   * a link out to the thing the user was probably reaching for anyway — log
   * progress on it, or start a re-run. Without it the matches are still listed,
   * just not clickable.
   */
  onOpenExisting?: (item: MediaItem) => void;
}

export function MediaFormModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialData,
  onOpenExisting,
}: MediaFormModalProps) {
  const { taxonomies, settings, media, franchises, refreshData } = useMediaContext();
  const toast = useToast();

  // Adding an entry no longer asks for genres and tags: the server tags it (and
  // compiles its Codex) in the background once it exists. Editing still offers
  // the fields, so anything the AI got wrong can be corrected by hand.
  const isEditing = !!initialData?.id;

  // Known franchises = the franchises table plus any used on existing media.
  const franchiseOptions = useMemo(() => {
    const set = new Set<string>();
    (franchises || []).forEach((f: any) => { if (f?.name) set.add(f.name); });
    (media || []).forEach((m: any) => (m.franchises || []).forEach((fr: string) => { if (fr) set.add(fr); }));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [franchises, media]);
  const [formData, setFormData] = useState<Partial<MediaItem>>({
    title: "",
    mediaType: "Game",
    status: "Active",
  });

  const [isSearching, setIsSearching] = useState(false);
  const [isAiTagging, setIsAiTagging] = useState(false);
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);
  const [coverUpgrading, setCoverUpgrading] = useState(false);
  const [platformInput, setPlatformInput] = useState("");
  const [isPlatformDropdownOpen, setIsPlatformDropdownOpen] = useState(false);
  const [selectedSeriesForSeasons, setSelectedSeriesForSeasons] = useState<
    any | null
  >(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isRefetchingHltb, setIsRefetchingHltb] = useState(false);
  // Which provider to auto-fill Visual Novels from. VNDB is the default (Japanese VNs);
  // GameStoryLog covers western / adult VNs and supports update tracking.
  const [vnSource, setVnSource] = useState<"vndb" | "gsl">("vndb");

  // Versions offered in the picker: whatever the source listed, plus the current
  // upstream version and anything already stored, so an existing value is never lost.
  const versionOptions = useMemo(() => {
    const out: string[] = [];
    const add = (v?: string) => {
      const value = (v || "").trim();
      if (value && !out.some((x) => x.toLowerCase() === value.toLowerCase())) out.push(value);
    };
    add(formData.sourceVersion);
    (formData.sourceVersions || []).forEach(add);
    add(formData.installedVersion);
    return out;
  }, [formData.sourceVersion, formData.sourceVersions, formData.installedVersion]);

  // Routes already recorded for this title, so re-runs can reuse consistent names
  // instead of "Bella" / "bella" / "Bella route" drifting apart.
  const routeOptions = useMemo(() => {
    const rootId = formData.originalMediaId || formData.id;
    if (!rootId) return [];
    const family = (media || []).filter(
      (m: any) => m.id === rootId || m.originalMediaId === rootId,
    );
    const seen = new Set<string>();
    const out: string[] = [];
    family.forEach((m: any) => {
      const r = (m.route || '').trim();
      if (r && !seen.has(r.toLowerCase())) { seen.add(r.toLowerCase()); out.push(r); }
    });
    return out;
  }, [media, formData.id, formData.originalMediaId]);

  const [rawInputs, setRawInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
      setRawInputs({
        genres: initialData.genres?.join(", ") || "",
        tags: initialData.tags?.join(", ") || "",
        platforms: initialData.platforms?.join(", ") || "",
        franchises: initialData.franchises?.join(", ") || "",
      });
    } else {
      setFormData({ title: "", mediaType: "Game", status: "Active" });
      setRawInputs({ genres: "", tags: "", platforms: "", franchises: "" });
    }
    setSearchResults(null);
    setSelectedSeriesForSeasons(null);
    setIsConfirmingDelete(false);
  }, [initialData, isOpen]);

  // (Auto-complete-on-progress was removed: editing progress fields must never
  // change a media item's status. Status only changes via the manual dropdown.)

  // Duplicate guard, live as the title is typed. This used to be skipped whenever
  // `initialData` was passed at all — which the library's own Add button does, to
  // preseed the media type — so the check was off in the one place duplicates are
  // most likely. It now runs for anything without an id, i.e. anything not yet saved.
  const duplicateMatches = useMemo(
    () =>
      isEditing
        ? []
        : findDuplicateMatches(formData.title || "", formData.mediaType, media || [], {
            excludeId: initialData?.id,
          }),
    [formData.title, formData.mediaType, media, isEditing, initialData?.id],
  );
  /** The ones that would really be a second copy, as opposed to another format. */
  const sameTypeDuplicates = duplicateMatches.filter((d) => d.sameType);

  if (!isOpen) return null;

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value, type } = e.target as any;
    let finalValue = value;
    if (type === "number") {
      finalValue = value === "" ? undefined : Number(value);
    }
    setFormData((prev) => ({ ...prev, [name]: finalValue }));
  };

  const handleArrayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setRawInputs((prev) => ({ ...prev, [name]: value }));
    setFormData((prev) => ({
      ...prev,
      [name]: value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.mediaType || !formData.status) return;

    // Safeguard against accidental duplicates. If you truly want a fresh entry
    // (a different edition, say), you can still confirm and proceed.
    if (sameTypeDuplicates.length > 0) {
      const existing = sameTypeDuplicates[0].item;
      const proceed = window.confirm(
        `You already have a ${existing.mediaType} entry for "${existing.title}" (${existing.status}). ` +
          `If you're replaying or rereading it, use the Re-run option on that entry instead. ` +
          `Add this as a separate entry anyway?`,
      );
      if (!proceed) return;
    }

    let finalData = { ...formData };

    if (
      (finalData.status === "Completed" || finalData.status === "Extras") &&
      typeof finalData.userRating !== "number"
    ) {
      const ratingStr = window.prompt(
        `You've completed ${finalData.title}! How would you rate it from 1 to 5?`,
      );
      if (ratingStr && !isNaN(Number(ratingStr))) {
        let rating = Number(ratingStr);
        if (rating < 0) rating = 0;
        if (rating > 5) rating = 5;
        finalData.userRating = rating;
      }
    }

    onSave(finalData as any);
    onClose();
  };

  const handleSearchMetadata = async () => {
    if (!formData.title) return;
    setIsSearching(true);
    setSearchResults(null);
    setSelectedSeriesForSeasons(null);
    try {
      if (formData.mediaType === "Game") {
        const results = await IntegrationsService.searchGameMetadata(
          formData.title,
        );
        setSearchResults(results);
      } else if (formData.mediaType === "Visual Novel") {
        // VNDB covers Japanese VNs well; GameStoryLog covers western/adult VNs.
        const results =
          vnSource === "gsl"
            ? await IntegrationsService.searchGSLMetadata(formData.title)
            : await IntegrationsService.searchVNDBMetadata(formData.title);
        setSearchResults(results);
      } else if (formData.mediaType === "Book" || formData.mediaType === "Audiobook") {
        const results = await IntegrationsService.searchBookMetadata(
          formData.title,
          formData.language,
        );
        setSearchResults(results);
      } else if (
        formData.mediaType === "Movie" ||
        formData.mediaType === "Series"
      ) {
        const results = await IntegrationsService.searchTMDBMetadata(
          formData.title,
          formData.mediaType,
        );
        setSearchResults(results);
      } else if (formData.mediaType === "Manga") {
        const results = await IntegrationsService.searchMangaMetadata(
          formData.title,
        );
        setSearchResults(results);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to search metadata. Please ensure API keys are configured in Settings.");
    } finally {
      setIsSearching(false);
    }
  };

  const applySearchResult = (match: any) => {
    if (
      formData.mediaType === "Series" &&
      match.seasons &&
      match.seasons.length > 0
    ) {
      setSelectedSeriesForSeasons(match);
      setSearchResults(null);
      return;
    }

    setFormData((prev) => ({
      ...prev,
      title: match.title,
      subtitle: match.subtitle,
      description: match.description,
      creator: match.creator || match.developer || match.author, // Handle different API schemas
      publisher: match.publisher,
      language: match.language,
      maturityRating: match.maturityRating,
      year: match.year,
      // Genres and tags are never taken from a metadata source — every source
      // uses its own vocabulary, and importing it fills the library with terms
      // outside the taxonomy. Auto-tagging owns these fields, so an auto-fill
      // leaves whatever is already on the entry alone rather than clearing it.
      genres: prev.genres || [],
      tags: prev.tags || [],
      platforms: formData.platforms || [], // Keep existing or empty, do not auto-populate
      franchises: match.franchises || [],
      reviewScore: match.reviewScore,
      averagePlaytime: match.averagePlaytime,
      hltbMain: match.hltbMain,
      hltbMainExtra: match.hltbMainExtra,
      hltbCompletionist: match.hltbCompletionist,
      selectedHltbType: match.selectedHltbType || "mainExtra",
      totalPages: match.totalPages,
      totalEpisodes: match.totalEpisodes,
      totalChapters: match.totalChapters,
      runtimeMinutes: match.runtimeMinutes,
      coverImageUrl: match.coverImageUrl,
      originalMediaId: match.id,
      // Remember where this came from so it can be re-checked for updates later.
      ...(match.metadataSource
        ? {
            metadataSource: match.metadataSource,
            metadataSourceId: match.metadataSourceId,
            sourceUrl: match.sourceUrl,
            sourceVersion: match.sourceVersion,
            sourceVersions: match.sourceVersions || [],
            // Adding something now almost always means grabbing the current build,
            // so seed the installed version to match. Editable afterwards.
            installedVersion: prev.installedVersion || match.sourceVersion,
            sourceUpdatedAt: match.sourceUpdatedAt,
            releaseStatus: match.releaseStatus ?? undefined,
            updateAvailable: false,
          }
        : {}),
    }));
    setAvailablePlatforms(match.platforms || []);
    setSearchResults(null);

    // Google Books search results only carry a ~128px thumbnail. Ask the server
    // for something worth looking at, in the background — the form is usable
    // meanwhile, and if the user picks a different book first the guard below
    // stops a late answer from overwriting it.
    if (match.metadataSource === "googlebooks" && match.metadataSourceId) {
      setCoverUpgrading(true);
      IntegrationsService.upgradeBookCover(match.metadataSourceId, match.coverImageUrl)
        .then((best) => {
          if (!best?.url) return;
          setFormData((prev) =>
            prev.originalMediaId === match.id ? { ...prev, coverImageUrl: best.url } : prev,
          );
        })
        .finally(() => setCoverUpgrading(false));
    }
  };

  const applySeason = (series: any, season: any) => {
    setFormData((prev) => ({
      ...prev,
      title: `${series.title} - ${season.name}`,
      description: season.overview || series.description,
      creator: series.creator || series.developer || series.author,
      publisher: series.publisher,
      year: season.airDate
        ? new Date(season.airDate).getFullYear()
        : series.year,
      genres: prev.genres || [],
      tags: prev.tags || [],
      reviewScore: season.voteAverage
        ? Math.round(season.voteAverage) / 2
        : series.reviewScore,
      totalEpisodes: season.episodeCount,
      runtimeMinutes: series.runtimeMinutes,
      coverImageUrl: season.posterPath || series.coverImageUrl,
      season: season.seasonNumber,
      // A season inherits its parent series' provenance so it links back correctly.
      ...(series.metadataSource
        ? {
            metadataSource: series.metadataSource,
            metadataSourceId: series.metadataSourceId,
            sourceUrl: series.sourceUrl,
          }
        : {}),
    }));
    setSelectedSeriesForSeasons(null);
  };

  const handleRefetchHltb = async () => {
    if (
      !formData.title ||
      !["Game", "Visual Novel"].includes(formData.mediaType)
    )
      return;
    setIsRefetchingHltb(true);
    try {
      const data = await IntegrationsService.fetchHltbData(formData.title);
      setFormData((prev) => ({
        ...prev,
        hltbMain: data.hltbMain,
        hltbMainExtra: data.hltbMainExtra,
        hltbCompletionist: data.hltbCompletionist,
        averagePlaytime:
          prev.selectedHltbType === "main"
            ? data.hltbMain
            : prev.selectedHltbType === "completionist"
              ? data.hltbCompletionist
              : data.hltbMainExtra,
      }));
    } catch (e) {
      console.error(e);
      toast.error("Failed to find HLTB data for this title.");
    } finally {
      setIsRefetchingHltb(false);
    }
  };

  const handleAutoTag = async () => {
    if (!initialData?.id) return;

    setIsAiTagging(true);
    try {
      // Same tagger the server runs after a new entry is saved, so both paths
      // produce the same result and there is only one prompt to maintain.
      const parsed = await DatabaseService.autoTagMedia(initialData.id);
      setFormData((prev) => ({ ...prev, genres: parsed.genres, tags: parsed.tags }));
      setRawInputs((prev) => ({
        ...prev,
        genres: parsed.genres.join(", "),
        tags: parsed.tags.join(", "),
      }));
      refreshData();
    } catch (error: any) {
      console.error("AutoTag Error:", error);
      toast.error("Auto Tag Failed: " + error.message);
    } finally {
      setIsAiTagging(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl relative">
        <div className="flex justify-between items-center p-6 border-b border-white/5">
          <h2 className="text-xl font-bold text-white">
            {isEditing ? "Edit Media" : "Add Media"}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-6 space-y-4 max-h-[70vh] overflow-y-auto"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-0">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Type *
              </label>
              <select
                name="mediaType"
                value={formData.mediaType}
                onChange={handleChange}
                className="input-field"
              >
                {MEDIA_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Status *
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="input-field"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="relative z-10 block">
            <div className="flex items-center justify-between mb-1 gap-3">
              <label className="block text-sm font-medium text-zinc-400">
                Title *
              </label>
              {formData.mediaType === "Visual Novel" && (
                <div className="flex items-center gap-1 bg-black/30 border border-white/10 rounded-lg p-0.5">
                  {([
                    { key: "vndb", label: "VNDB", hint: "Best for Japanese visual novels" },
                    { key: "gsl", label: "GameStoryLog", hint: "Best for western / adult VNs, supports update tracking" },
                  ] as const).map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      title={s.hint}
                      onClick={() => { setVnSource(s.key); setSearchResults(null); }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                        vnSource === s.key
                          ? "bg-orange-500/20 text-orange-300"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <input
                required
                name="title"
                value={formData.title}
                onChange={handleChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault(); // Prevent form submission
                    if (formData.title && !isSearching) {
                      handleSearchMetadata();
                    }
                  }
                }}
                className="input-field"
                placeholder="E.g., The Witcher 3"
              />
              {[
                "Game",
                "Book",
                "Audiobook",
                "Movie",
                "Series",
                "Visual Novel",
                "Manga",
              ].includes(formData.mediaType) && (
                <button
                  type="button"
                  onClick={handleSearchMetadata}
                  disabled={isSearching || !formData.title}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white font-medium rounded-xl transition flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSearching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  Auto-fill
                </button>
              )}
            </div>

            {/* Autofill Results */}
            {searchResults && searchResults.length > 0 && (
              <div className="absolute top-full left-0 w-full mt-2 bg-[#18181b] border border-white/10 rounded-xl shadow-2xl p-2 z-50 flex flex-col gap-1 max-h-64 overflow-y-auto">
                <div className="flex justify-between items-center px-2 py-1 mb-1">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Select Match
                  </span>
                  <button
                    type="button"
                    onClick={() => setSearchResults(null)}
                    className="text-zinc-500 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {searchResults.map((res, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => applySearchResult(res)}
                    className="w-full text-left p-2 rounded-lg hover:bg-white/5 transition flex items-center group border border-transparent hover:border-white/5 gap-3"
                  >
                    {res.coverImageUrl ? (
                      <img src={res.coverImageUrl} className="w-10 h-14 object-cover rounded shadow-md shrink-0" alt="" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-10 h-14 bg-white/5 border border-white/10 rounded shadow-md shrink-0 flex items-center justify-center text-zinc-600">
                        <span className="text-[10px] uppercase font-bold text-center">N/A</span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-white line-clamp-2 group-hover:text-orange-400 transition-colors">
                        {res.title}{" "}
                        <span className="text-zinc-500 font-normal">
                          ({res.year})
                        </span>
                      </div>
                      <div className="text-xs text-zinc-400 truncate mt-0.5">
                        {formData.mediaType === "Game" ||
                        formData.mediaType === "Visual Novel" ? (
                          <>
                            {res.developer || res.creator} •{" "}
                            {res.reviewScore
                              ? `${res.reviewScore}/5`
                              : "No Rating"}{" "}
                            •{" "}
                            {res.averagePlaytime
                              ? `${res.averagePlaytime}h`
                              : "N/A"}
                          </>
                        ) : formData.mediaType === "Movie" ? (
                          <>
                            {res.creator || "Unknown Director"} •{" "}
                            {res.reviewScore
                              ? `${res.reviewScore}/5`
                              : "No Rating"}{" "}
                            •{" "}
                            {res.runtimeMinutes
                              ? `${res.runtimeMinutes} mins`
                              : "N/A"}
                          </>
                        ) : formData.mediaType === "Series" ? (
                          <>
                            {res.creator || "Unknown Creator"} •{" "}
                            {res.reviewScore
                              ? `${res.reviewScore}/5`
                              : "No Rating"}{" "}
                            •{" "}
                            {res.seasons
                              ? `${res.seasons.length} Seasons`
                              : "N/A"}{" "}
                            •{" "}
                            {res.runtimeMinutes
                              ? `~${res.runtimeMinutes}m/ep`
                              : "N/A"}
                          </>
                        ) : formData.mediaType === "Manga" ? (
                          <>
                            {res.creator || "Unknown Creator"} •{" "}
                            {res.reviewScore
                              ? `${res.reviewScore}/5`
                              : "No Rating"}{" "}
                            •{" "}
                            {res.totalChapters
                              ? `${res.totalChapters} Ch`
                              : "Ongoing/Unknown"}
                          </>
                        ) : formData.mediaType === "Book" ? (
                          <>
                            {res.language ? `[${res.language}] ` : ""}
                            {res.creator || "Unknown Author"} •{" "}
                            {res.reviewScore
                              ? `${res.reviewScore}/5`
                              : "No Rating"}{" "}
                            •{" "}
                            {res.totalPages ? `${res.totalPages} pages` : "N/A"}
                          </>
                        ) : (
                          <>
                            {res.creator || "Unknown Author"} •{" "}
                            {res.reviewScore
                              ? `${res.reviewScore}/5`
                              : "No Rating"}{" "}
                            •{" "}
                            {res.totalPages ? `${res.totalPages} pages` : "N/A"}
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Season Selection */}
            {selectedSeriesForSeasons && (
              <div className="absolute top-full left-0 w-full mt-2 bg-[#18181b] border border-white/10 rounded-xl shadow-2xl p-2 z-50 flex flex-col gap-1 max-h-64 overflow-y-auto">
                <div className="flex justify-between items-center px-2 py-1 mb-1">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Select Season for {selectedSeriesForSeasons.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedSeriesForSeasons(null)}
                    className="text-zinc-500 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {selectedSeriesForSeasons.seasons.map((s: any) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => applySeason(selectedSeriesForSeasons, s)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition flex justify-between items-center group border border-transparent hover:border-white/5 gap-4"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-white line-clamp-2 group-hover:text-orange-400 transition-colors">
                        {s.name}{" "}
                        <span className="text-zinc-500 font-normal">
                          ({s.seasonNumber})
                        </span>
                      </div>
                      <div className="text-xs text-zinc-400 truncate mt-0.5">
                        {s.episodeCount} Episodes •{" "}
                        {s.airDate
                          ? new Date(s.airDate).getFullYear()
                          : "Unknown Year"}{" "}
                        •{" "}
                        {s.voteAverage
                          ? `${Math.round(s.voteAverage) / 2}/5`
                          : "No Rating"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {duplicateMatches.length > 0 && (
            <div className={cn(
              "rounded-xl border p-3",
              sameTypeDuplicates.length > 0
                ? "border-amber-500/30 bg-amber-500/10"
                : "border-sky-500/25 bg-sky-500/[0.07]",
            )}>
              <div className="flex items-start gap-3">
                <AlertTriangle className={cn("w-4 h-4 shrink-0 mt-0.5", sameTypeDuplicates.length > 0 ? "text-amber-400" : "text-sky-400")} />
                <div className="text-sm leading-snug">
                  <span className="font-semibold text-white">
                    {sameTypeDuplicates.length > 0
                      ? "You already have this."
                      : "You have this in another format."}
                  </span>{" "}
                  <span className={sameTypeDuplicates.length > 0 ? "text-amber-200/90" : "text-sky-200/90"}>
                    {onOpenExisting
                      ? "Open it to log progress, or start a re-run if you are going through it again."
                      : "Use the Re-run option on that entry if you are going through it again."}
                  </span>
                </div>
              </div>

              {/* Each match is the entry itself: clicking it leaves this form and
                  opens the thing the user probably came here to reach. */}
              <div className="mt-3 space-y-1.5">
                {duplicateMatches.map(({ item, exact, sameType }) => {
                  const Row = onOpenExisting ? "button" : "div";
                  return (
                    <Row
                      key={item.id}
                      {...(onOpenExisting
                        ? { type: "button" as const, onClick: () => onOpenExisting(item) }
                        : {})}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-left",
                        onOpenExisting && "hover:border-white/25 hover:bg-black/50 transition-colors cursor-pointer",
                      )}
                    >
                      {item.coverImageUrl ? (
                        <img src={item.coverImageUrl} alt="" referrerPolicy="no-referrer"
                             className="w-8 h-11 object-cover rounded shrink-0 border border-white/10" />
                      ) : (
                        <div className="w-8 h-11 rounded bg-white/5 border border-white/10 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-white truncate">{item.title}</span>
                        <span className="block text-[11px] text-zinc-400 truncate">
                          {item.mediaType} · {item.status}
                          {item.year ? ` · ${item.year}` : ""}
                          {!exact && " · similar title"}
                          {!sameType && " · different format"}
                        </span>
                      </span>
                      {onOpenExisting && <ArrowRight className="w-4 h-4 text-zinc-500 shrink-0" />}
                    </Row>
                  );
                })}
              </div>
            </div>
          )}

          {["Visual Novel", "Game"].includes(formData.mediaType) && (
            <div className="block mt-4 relative z-0">
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Route <span className="text-zinc-600 font-normal">(optional)</span>
              </label>
              <input
                name="route"
                list="route-options"
                value={formData.route || ""}
                onChange={handleChange}
                className="input-field"
                placeholder="E.g., Bella, Corruption path, True Ending"
                autoComplete="off"
              />
              <datalist id="route-options">
                {routeOptions.map((r) => <option key={r} value={r} />)}
              </datalist>
              <p className="text-[11px] text-zinc-500 mt-1">
                One route per playthrough. To play another, use Re-run on this entry.
              </p>
            </div>
          )}

          {["Visual Novel", "Game"].includes(formData.mediaType) && (
            <div className="block mt-4 relative z-0">
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Installed Version
              </label>
              {/* A datalist gives a dropdown of known versions while still accepting
                  anything typed, since a source rarely lists every build. */}
              <input
                name="installedVersion"
                list="installed-version-options"
                value={formData.installedVersion || ""}
                onChange={handleChange}
                className="input-field"
                placeholder="E.g., v1.06 — the build you actually have"
                autoComplete="off"
              />
              <datalist id="installed-version-options">
                {versionOptions.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>

              {versionOptions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {versionOptions.slice(0, 6).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, installedVersion: v }))}
                      className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                        formData.installedVersion === v
                          ? "bg-orange-500/20 border-orange-500/40 text-orange-200"
                          : "bg-black/30 border-white/10 text-zinc-400 hover:text-white hover:border-white/20"
                      }`}
                      title={v === formData.sourceVersion ? "Latest upstream version" : "Known version"}
                    >
                      {v}
                      {v === formData.sourceVersion && <span className="ml-1 text-emerald-400">latest</span>}
                    </button>
                  ))}
                </div>
              )}

              {formData.sourceVersion && formData.sourceVersion !== formData.installedVersion && (
                <p className="text-[11px] text-emerald-400/80 mt-2">
                  Latest upstream: {formData.sourceVersion}
                </p>
              )}
            </div>
          )}

          <div className="block mt-4 relative z-0">
            <label className="block text-sm font-medium text-zinc-400 mb-1">
              Subtitle
            </label>
            <input
              name="subtitle"
              value={formData.subtitle || ""}
              onChange={handleChange}
              className="input-field"
              placeholder="Optional subtitle..."
            />
          </div>

          {["Book", "Audiobook"].includes(formData.mediaType) && (
            <div className="block mt-4 relative z-0">
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Language (For Metadata Search)
              </label>
              <select
                name="language"
                value={formData.language || ""}
                onChange={handleChange}
                className="input-field"
              >
                <option value="">Any Language</option>
                <option value="en">English</option>
                <option value="de">German</option>
              </select>
            </div>
          )}



          <div className="flex items-center gap-2 mb-4 bg-orange-500/5 border border-orange-500/10 p-3 rounded-xl">
            <input
              type="checkbox"
              id="noEnemies"
              name="noEnemies"
              checked={formData.noEnemies || false}
              onChange={(e) =>
                setFormData((p) => ({
                  ...p,
                  noEnemies: e.target.checked,
                }))
              }
              className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-orange-500 focus:ring-orange-500 cursor-pointer"
            />
            <label htmlFor="noEnemies" className="text-xs font-semibold text-orange-200 cursor-pointer select-none">
              Disable Enemy Generation
              <span className="block text-[10px] font-normal text-zinc-500 mt-0.5">
                Check this if you want to track this media without spawning World Bosses.
              </span>
            </label>
          </div>

          <div className="flex items-center gap-2 mb-4 bg-rose-500/5 border border-rose-500/10 p-3 rounded-xl">
            <input
              type="checkbox"
              id="isHighPriority"
              name="isHighPriority"
              checked={formData.isHighPriority || false}
              onChange={(e) =>
                setFormData((p) => ({
                  ...p,
                  isHighPriority: e.target.checked,
                }))
              }
              className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-rose-500 focus:ring-rose-500 cursor-pointer"
            />
            <label htmlFor="isHighPriority" className="text-xs font-semibold text-rose-200 cursor-pointer select-none">
              High Priority Target
              <span className="block text-[10px] font-normal text-zinc-500 mt-0.5">
                Double the chance of Enemy Generation to keep you motivated.
              </span>
            </label>
          </div>

          <div className="flex items-center gap-2 mb-4 bg-sky-500/5 border border-sky-500/10 p-3 rounded-xl">
            <input
              type="checkbox"
              id="noAutoDrop"
              name="noAutoDrop"
              checked={formData.noAutoDrop || false}
              onChange={(e) =>
                setFormData((p) => ({
                  ...p,
                  noAutoDrop: e.target.checked,
                }))
              }
              className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-sky-500 focus:ring-sky-500 cursor-pointer"
            />
            <label htmlFor="noAutoDrop" className="text-xs font-semibold text-sky-200 cursor-pointer select-none">
              No Automatic Drop
              <span className="block text-[10px] font-normal text-zinc-500 mt-0.5">
                Never auto-drop this from inactivity, and keep the cover from aging (greyscale, cobwebs).
              </span>
            </label>
          </div>

          {(formData.mediaType === 'Game' || formData.mediaType === 'Visual Novel') && (
            <div className="mb-4 bg-white/5 border border-white/10 p-4 rounded-xl">
              <label className="block text-sm font-medium text-purple-400 mb-1">
                Story Heavy Modifier
                <span className="text-zinc-500 font-normal ml-2 text-xs">(Master Pages Multiplier)</span>
              </label>
              <input
                type="range"
                name="storyHeavyModifier"
                min="0.5"
                max="1.5"
                step="0.1"
                value={formData.storyHeavyModifier ?? 1.0}
                onChange={(e) => setFormData(p => ({ ...p, storyHeavyModifier: parseFloat(e.target.value) }))}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <div className="flex justify-between mt-2">
                <span className="text-[10px] text-zinc-500 font-bold">x0.5 Gameplay Heavy</span>
                <span className="text-[10px] text-purple-400 font-bold uppercase tracking-widest">x{Number(formData.storyHeavyModifier ?? 1.0).toFixed(1)}</span>
                <span className="text-[10px] text-zinc-500 font-bold">x1.5 Story Heavy</span>
              </div>
              <p className="text-[10px] text-zinc-400 mt-2">
                Adjust how much playtime translates to Master Pages. A story-heavy game gives more Master Pages per hour played compared to a gameplay-focused title.
              </p>
            </div>
          )}

          {formData.status === "Dropped" && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-red-400 mb-1">
                Reason for Dropping
              </label>
              <textarea
                name="dropReason"
                value={formData.dropReason || ""}
                onChange={handleChange}
                className="input-field min-h-[60px]"
                placeholder="Why did you stop? (e.g., Too repetitive, lost interest...)"
              />
            </div>
          )}

          {formData.status === "Unreleased" && (
            <div className="mb-4 grid grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-blue-400 mb-1">
                  Expected Release Date
                </label>
                <input
                  type="datetime-local"
                  name="expectedReleaseDate"
                  value={
                    (() => {
                      if (!formData.expectedReleaseDate) return "";
                      const d = new Date(formData.expectedReleaseDate);
                      return isNaN(d.getTime()) ? "" : format(d, "yyyy-MM-dd'T'HH:mm");
                    })()
                  }
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      expectedReleaseDate: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : "",
                    }))
                  }
                  className="input-field"
                />
              </div>
            </div>
          )}

          {formData.mediaType === "Game" ||
          formData.mediaType === "Visual Novel" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">
                  Developer
                </label>
                <input
                  name="creator"
                  value={formData.creator || ""}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="CD Projekt Red"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">
                  Publisher
                </label>
                <input
                  name="publisher"
                  value={formData.publisher || ""}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="Warner Bros"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">
                  Release Year
                </label>
                <input
                  type="number"
                  name="year"
                  value={formData.year || ""}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="2015"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">
                  Review Score (0-5)
                </label>
                <input
                  type="number"
                  name="reviewScore"
                  step="0.5"
                  min="0"
                  max="5"
                  value={formData.reviewScore ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData((p) => ({
                      ...p,
                      reviewScore: val === "" ? undefined : Number(val),
                    }));
                  }}
                  className="input-field"
                  placeholder="Leave unrated"
                />
              </div>
              {isEditing ? (
                <>
              <div className="col-span-1 sm:col-span-2 flex items-center justify-between mt-2">
                  <label className="block text-sm font-medium text-zinc-400">
                    Genres &amp; Tags
                  </label>
                  <button
                    type="button"
                    onClick={handleAutoTag}
                    disabled={isAiTagging || !formData.title}
                    className="flex items-center gap-2 text-xs bg-purple-500/20 text-purple-300 px-3 py-1.5 rounded hover:bg-purple-500/30 transition shadow border border-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Re-run auto-tagging for this entry"
                  >
                    {isAiTagging ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <BrainCircuit className="w-3 h-3" />
                    )}
                    {isAiTagging ? "Tagging…" : "Auto-Tag"}
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Genres (comma separated)
                  </label>
                  <input
                    name="genres"
                    value={rawInputs.genres ?? ""}
                    onChange={handleArrayChange}
                    className="input-field"
                    placeholder="RPG, Open World"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Tags (comma separated)
                  </label>
                  <input
                    name="tags"
                    value={rawInputs.tags ?? ""}
                    onChange={handleArrayChange}
                    className="input-field"
                    placeholder="Fantasy, Story Rich"
                  />
                </div>
                </>
              ) : (
                <AutoTagNotice />
              )}
              {formData.mediaType === "Game" && (
                <div className="relative">
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Platforms
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {formData.platforms?.map((p, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-1 bg-purple-500/20 text-purple-300 rounded flex items-center gap-1"
                      >
                        {p}
                        <button
                          type="button"
                          onClick={() =>
                            setFormData((old) => ({
                              ...old,
                              platforms: old.platforms?.filter((x) => x !== p),
                            }))
                          }
                          className="text-purple-400 hover:text-purple-200"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="relative flex items-center">
                    <input
                      value={platformInput}
                      onChange={(e) => {
                        setPlatformInput(e.target.value);
                        setIsPlatformDropdownOpen(true);
                      }}
                      onFocus={() => setIsPlatformDropdownOpen(true)}
                      onBlur={() =>
                        setTimeout(() => setIsPlatformDropdownOpen(false), 200)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && platformInput.trim()) {
                          e.preventDefault();
                          if (
                            !formData.platforms?.includes(platformInput.trim())
                          ) {
                            setFormData((old) => ({
                              ...old,
                              platforms: [
                                ...(old.platforms || []),
                                platformInput.trim(),
                              ],
                            }));
                          }
                          setPlatformInput("");
                        }
                      }}
                      className="input-field"
                      placeholder="Add platform or select from dropdown (Enter to add)"
                    />
                  </div>
                  {isPlatformDropdownOpen &&
                    (availablePlatforms.length > 0 || platformInput.trim()) && (
                      <div className="absolute z-10 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                        {platformInput.trim() &&
                          !availablePlatforms.includes(platformInput.trim()) &&
                          !formData.platforms?.includes(
                            platformInput.trim(),
                          ) && (
                            <button
                              type="button"
                              className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
                              onClick={() => {
                                setFormData((old) => ({
                                  ...old,
                                  platforms: [
                                    ...(old.platforms || []),
                                    platformInput.trim(),
                                  ],
                                }));
                                setPlatformInput("");
                              }}
                            >
                              Add "{platformInput.trim()}"
                            </button>
                          )}
                        {availablePlatforms
                          .filter(
                            (p) =>
                              !formData.platforms?.includes(p) &&
                              p
                                .toLowerCase()
                                .includes(platformInput.toLowerCase()),
                          )
                          .map((p, i) => (
                            <button
                              key={i}
                              type="button"
                              className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
                              onClick={() => {
                                setFormData((old) => ({
                                  ...old,
                                  platforms: [...(old.platforms || []), p],
                                }));
                                setPlatformInput("");
                              }}
                            >
                              {p}
                            </button>
                          ))}
                      </div>
                    )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">
                  Franchises (comma separated)
                </label>
                <FranchiseInput
                  value={rawInputs.franchises ?? ""}
                  onChange={(v) => handleArrayChange({ target: { name: "franchises", value: v } } as any)}
                  options={franchiseOptions}
                  placeholder={
                    formData.mediaType === "Visual Novel"
                      ? "Fate, Muv-Luv"
                      : "The Legend of Zelda, Mario"
                  }
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-sm font-medium text-zinc-400 mb-1">
                  {formData.mediaType === "Movie"
                    ? "Director"
                    : formData.mediaType === "Series"
                      ? "Creator / Showrunner"
                      : formData.mediaType === "Book"
                        ? "Author"
                        : formData.mediaType === "Manga"
                          ? "Mangaka (Writer / Artist)"
                          : "Creator / Author / Studio"}
                </label>
                <input
                  name="creator"
                  value={formData.creator || ""}
                  onChange={handleChange}
                  className="input-field"
                  placeholder={
                    formData.mediaType === "Movie"
                      ? "e.g., Christopher Nolan"
                      : formData.mediaType === "Series"
                        ? "e.g., Craig Mazin"
                        : formData.mediaType === "Book"
                          ? "e.g., Brandon Sanderson"
                          : formData.mediaType === "Manga"
                            ? "e.g., Kentaro Miura"
                            : "Enter creator name"
                  }
                />
              </div>
              {(formData.mediaType === "Book" ||
                formData.mediaType === "Manga") && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">
                      Publisher
                    </label>
                    <input
                      name="publisher"
                      value={formData.publisher || ""}
                      onChange={handleChange}
                      className="input-field"
                      placeholder="e.g., Tor Books"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">
                      Maturity Rating
                    </label>
                    <input
                      name="maturityRating"
                      value={formData.maturityRating || ""}
                      onChange={handleChange}
                      className="input-field"
                      placeholder="e.g., MATURE or NOT_MATURE"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">
                  Release Year
                </label>
                <input
                  type="number"
                  name="year"
                  value={formData.year || ""}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="2015"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">
                  Review Score (0-5)
                </label>
                <input
                  type="number"
                  name="reviewScore"
                  step="0.5"
                  min="0"
                  max="5"
                  value={formData.reviewScore ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData((p) => ({
                      ...p,
                      reviewScore: val === "" ? undefined : Number(val),
                    }));
                  }}
                  className="input-field"
                  placeholder="Leave unrated"
                />
              </div>
              {isEditing ? (
                <>
              <div className="col-span-1 sm:col-span-2 flex items-center justify-between mt-2">
                  <label className="block text-sm font-medium text-zinc-400">
                    Genres &amp; Tags
                  </label>
                  <button
                    type="button"
                    onClick={handleAutoTag}
                    disabled={isAiTagging || !formData.title}
                    className="flex items-center gap-2 text-xs bg-purple-500/20 text-purple-300 px-3 py-1.5 rounded hover:bg-purple-500/30 transition shadow border border-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Re-run auto-tagging for this entry"
                  >
                    {isAiTagging ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <BrainCircuit className="w-3 h-3" />
                    )}
                    {isAiTagging ? "Tagging…" : "Auto-Tag"}
                  </button>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Genres (comma separated)
                  </label>
                  <input
                    name="genres"
                    value={rawInputs.genres ?? ""}
                    onChange={handleArrayChange}
                    className="input-field"
                    placeholder="Fantasy, Sci-Fi"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Tags (comma separated)
                  </label>
                  <input
                    name="tags"
                    value={rawInputs.tags ?? ""}
                    onChange={handleArrayChange}
                    className="input-field"
                    placeholder="Space, Magic"
                  />
                </div>
                </>
              ) : (
                <AutoTagNotice />
              )}
              <div className="col-span-2">
                <label className="block text-sm font-medium text-zinc-400 mb-1">
                  Franchises (comma separated)
                </label>
                <FranchiseInput
                  value={rawInputs.franchises ?? ""}
                  onChange={(v) => handleArrayChange({ target: { name: "franchises", value: v } } as any)}
                  options={franchiseOptions}
                  placeholder="Marvel Cinematic Universe, Harry Potter"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">
              Description
            </label>
            <textarea
              name="description"
              value={formData.description || ""}
              onChange={(e) =>
                setFormData((p) => ({ ...p, description: e.target.value }))
              }
              className="input-field min-h-[80px]"
              placeholder="A brief summary..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">
              Cover Image URL
            </label>
            <input
              name="coverImageUrl"
              value={formData.coverImageUrl || ""}
              onChange={handleChange}
              className="input-field"
              placeholder="https://..."
            />
            {coverUpgrading && (
              <p className="text-[10px] text-zinc-500 mt-1.5 flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3 animate-spin" /> Looking for a higher-resolution cover…
              </p>
            )}
          </div>

          {/* Dynamic Fields Based on MediaType */}
          <div className="pt-4 border-t border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">
                Tracking Metrics
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-amber-500/80 mb-1">
                  Your Rating (0-5)
                </label>
                <input
                  type="number"
                  name="userRating"
                  step="0.5"
                  min="0"
                  max="5"
                  value={formData.userRating ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData((p) => ({
                      ...p,
                      userRating: val === "" ? undefined : Number(val),
                    }));
                  }}
                  className="input-field border-amber-500/20 focus:border-amber-500/50"
                  placeholder="Leave blank for unrated"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-amber-500/80 mb-1">
                  Your Review
                </label>
                <textarea
                  name="userReview"
                  value={formData.userReview ?? ""}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, userReview: e.target.value }))
                  }
                  className="input-field border-amber-500/20 focus:border-amber-500/50 min-h-[80px]"
                  placeholder="What did you think of it overall?"
                />
              </div>
            </div>

            {(formData.mediaType === "Game" ||
              formData.mediaType === "Visual Novel" ||
              formData.mediaType === "Audiobook") && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {formData.mediaType === "Game" && (
                  <div className="col-span-1 sm:col-span-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isOngoing"
                      name="isOngoing"
                      checked={formData.isOngoing || false}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          isOngoing: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-orange-500 focus:ring-orange-500 focus:ring-offset-zinc-900"
                    />
                    <label
                      htmlFor="isOngoing"
                      className="text-sm font-medium text-zinc-300"
                    >
                      Ongoing Game (e.g. Live Service, Multiplayer)
                    </label>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Your Playtime (Hours)
                  </label>
                  <input
                    type="number"
                    name="playtimeHours"
                    value={formData.playtimeHours || ""}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="0"
                  />
                </div>
                {(formData.mediaType === "Game" ||
                  formData.mediaType === "Visual Novel" ||
                  formData.mediaType === "Audiobook") && (
                  <div className="col-span-1 sm:col-span-2 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-1">
                        Target Playtime (Hours)
                      </label>
                      <input
                        type="number"
                        name="averagePlaytime"
                        value={formData.averagePlaytime || ""}
                        onChange={handleChange}
                        className="input-field"
                        placeholder="0"
                      />
                    </div>
                    {formData.hltbMain !== undefined && (
                      <div className="bg-zinc-800/30 p-4 rounded-2xl space-y-3 border border-white/5">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                          Select HLTB Target
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {[
                            {
                              id: "main",
                              label: "Main",
                              value: formData.hltbMain,
                            },
                            {
                              id: "mainExtra",
                              label: "Main + Extras",
                              value: formData.hltbMainExtra,
                            },
                            {
                              id: "completionist",
                              label: "Completionist",
                              value: formData.hltbCompletionist,
                            },
                          ].map((type) => (
                            <button
                              key={type.id}
                              type="button"
                              onClick={() => {
                                setFormData((prev) => ({
                                  ...prev,
                                  selectedHltbType: type.id as any,
                                  averagePlaytime: type.value,
                                }));
                              }}
                              className={cn(
                                "flex flex-col items-center justify-center p-2 rounded-xl text-[10px] transition-all border",
                                formData.selectedHltbType === type.id
                                  ? "bg-orange-500 text-white border-orange-400"
                                  : "bg-black/20 text-zinc-400 border-white/5 hover:border-white/10",
                              )}
                            >
                              <span className="opacity-70">{type.label}</span>
                              <span className="font-black text-sm">
                                {type.value}h
                              </span>
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={handleRefetchHltb}
                          disabled={isRefetchingHltb}
                          className="w-full flex items-center justify-center gap-2 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-colors border border-white/5"
                        >
                          <RefreshCw
                            className={cn(
                              "w-3 h-3",
                              isRefetchingHltb && "animate-spin",
                            )}
                          />
                          {isRefetchingHltb
                            ? "Updating..."
                            : "Re-Fetch HLTB Data"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {formData.mediaType === "Series" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Season
                  </label>
                  <input
                    type="number"
                    name="season"
                    value={formData.season || ""}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Episode Runtime (mins)
                  </label>
                  <input
                    type="number"
                    name="runtimeMinutes"
                    value={formData.runtimeMinutes || ""}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Episodes Watched
                  </label>
                  <input
                    type="number"
                    name="episodesWatched"
                    value={formData.episodesWatched || ""}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Total Episodes
                  </label>
                  <input
                    type="number"
                    name="totalEpisodes"
                    value={formData.totalEpisodes || ""}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="0"
                  />
                </div>
              </div>
            )}

            {formData.mediaType === "Book" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Pages Read
                  </label>
                  <input
                    type="number"
                    name="pagesRead"
                    value={formData.pagesRead || ""}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Total Pages
                  </label>
                  <input
                    type="number"
                    name="totalPages"
                    value={formData.totalPages || ""}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="0"
                  />
                </div>
              </div>
            )}

            {formData.mediaType === "Manga" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Chapters Read
                  </label>
                  <input
                    type="number"
                    name="chaptersRead"
                    value={formData.chaptersRead || ""}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Total Chapters
                  </label>
                  <input
                    type="number"
                    name="totalChapters"
                    value={formData.totalChapters || ""}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="0"
                  />
                </div>
                {formData.releaseStatus && (
                  <div className="col-span-1 sm:col-span-2">
                    <div className="text-xs text-zinc-500 mb-0">
                      Release Status: {formData.releaseStatus}
                    </div>
                  </div>
                )}
                <div className="col-span-1 sm:col-span-2 flex items-center mt-2">
                  <input
                    type="checkbox"
                    id="isOngoing"
                    name="isOngoing"
                    checked={formData.isOngoing || false}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        isOngoing: e.target.checked,
                      }))
                    }
                    className="mr-2 rounded bg-zinc-800 border-zinc-700 text-purple-600 focus:ring-purple-500"
                  />
                  <label htmlFor="isOngoing" className="text-sm text-zinc-300">
                    Is Ongoing (Will auto-update metadata)
                  </label>
                </div>
              </div>
            )}

            {formData.mediaType === "Comic" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Issues Read
                  </label>
                  <input
                    type="number"
                    name="issuesRead"
                    value={formData.issuesRead || ""}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Total Issues
                  </label>
                  <input
                    type="number"
                    name="totalIssues"
                    value={formData.totalIssues || ""}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="0"
                  />
                </div>
              </div>
            )}

            {formData.mediaType === "Movie" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border border-white/5 p-4 rounded-xl bg-zinc-900/50">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="watched"
                    id="watched-checkbox"
                    checked={!!formData.watched}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, watched: e.target.checked }))
                    }
                    className="w-5 h-5 accent-orange-500 rounded bg-zinc-800"
                  />
                  <label
                    htmlFor="watched-checkbox"
                    className="text-sm font-bold text-zinc-300 cursor-pointer"
                  >
                    Watched?
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Runtime (mins)
                  </label>
                  <input
                    type="number"
                    name="runtimeMinutes"
                    value={formData.runtimeMinutes || ""}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="120"
                  />
                </div>
              </div>
            )}
          </div>
        </form>

        <div className="p-6 border-t border-white/5 flex justify-between items-center bg-[#09090B] relative z-20">
          <div>
            {isEditing &&
              onDelete &&
              (isConfirmingDelete ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(initialData.id);
                      onClose();
                    }}
                    className="px-4 py-2 rounded-xl font-medium bg-red-600 text-white hover:bg-red-500 transition shadow-lg shadow-red-900/20"
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(false)}
                    className="px-4 py-2 rounded-xl font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  className="px-4 py-2 rounded-xl font-medium text-red-500 hover:text-white hover:bg-red-500/20 transition"
                >
                  Delete
                </button>
              ))}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-4 py-2 rounded-xl font-medium bg-orange-600 text-white hover:bg-orange-500 transition shadow-lg shadow-orange-900/20"
            >
              Save Media
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
