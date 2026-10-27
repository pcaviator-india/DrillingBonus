/**
 * Configuration for the NVIDIA AI client.
 * Everything is env-driven (config over code). Base URL and model names have
 * sensible defaults from NVIDIA's hosted catalog so only NVIDIA_API_KEY is
 * strictly required.
 */

export interface AiConfig {
  apiKey: string;
  baseUrl: string;
  /** Chat / reasoning model (explanations, matching suggestions, chat). */
  chatModel: string;
  /** Embedding model (fuzzy name/site/rig similarity). */
  embedModel: string;
  /** Per-request timeout so a slow AI call never hangs a background job. */
  timeoutMs: number;
}

const DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
// Verified live on the NVIDIA catalog on 2026-10-14 (earlier llama-3.3/nv-e5
// defaults were end-of-lifed). Override via NVIDIA_CHAT_MODEL / NVIDIA_EMBED_MODEL.
// Only these two were verified callable with our account key on 2026-10-14
// (other catalog IDs return 404 "not found for account" — the serverless
// catalog enabled for this key is limited). Override via env if access changes.
const DEFAULT_CHAT_MODEL = "meta/llama-3.2-90b-vision-instruct";
const DEFAULT_EMBED_MODEL = "nvidia/nemotron-3-embed-1b";
const DEFAULT_TIMEOUT_MS = 60_000;

function readTimeout(): number {
  const raw = process.env.NVIDIA_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

/** Returns null when AI is not configured — callers must degrade gracefully. */
export function getAiConfig(): AiConfig | null {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey || apiKey.trim() === "") return null;
  return {
    apiKey: apiKey.trim(),
    baseUrl: (process.env.NVIDIA_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
    chatModel: process.env.NVIDIA_CHAT_MODEL ?? DEFAULT_CHAT_MODEL,
    embedModel: process.env.NVIDIA_EMBED_MODEL ?? DEFAULT_EMBED_MODEL,
    timeoutMs: readTimeout(),
  };
}

/** Convenience flag for UI: should AI features be offered at all? */
export function isAiEnabled(): boolean {
  return getAiConfig() !== null;
}
