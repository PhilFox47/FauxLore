import express, { type Express, type ErrorRequestHandler } from "express";

/**
 * Wrapped archival research, full Journal Thoughts and previous editorial
 * material can legitimately exceed Express's default 100 KiB JSON limit.
 * Raise the limit ONLY for the authenticated AI chat proxy, never globally.
 * Bytes are still bounded; the upstream model's token context is independent.
 */
export const AI_CHAT_JSON_MAX_BYTES = 4 * 1024 * 1024;

export function installRequestBodyParsers(app: Express): void {
  app.use("/api/nano-gpt/chat/completions", express.json({ limit: AI_CHAT_JSON_MAX_BYTES }));
  app.use(express.json());

  // Avoid opaque HTML error pages when the client exceeds the configured
  // transport limit. Do not echo or log the large private user payload.
  const tooLarge: ErrorRequestHandler = (error, req, res, next) => {
    if (error?.type !== "entity.too.large") return next(error);
    const aiChat = req.path === "/api/nano-gpt/chat/completions";
    res.status(413).json({
      error: aiChat
        ? "AI chat request exceeds the 4 MiB transport limit. Split or summarize historical context; the user's logs were not discarded."
        : "JSON request exceeds the default request-size limit.",
    });
  };
  app.use(tooLarge);
}
