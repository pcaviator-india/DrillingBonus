/**
 * NVIDIA AI module — advisory layer only.
 *
 * Hard rule (see .clinerules): the bonus engine stays pure and deterministic.
 * Nothing in this module is ever imported by src/lib/bonus-engine or by
 * src/lib/calculations. AI output may suggest, explain, or rank — it never
 * calculates money and never writes drill/bonus data without human approval.
 */

/** OpenAI-compatible chat message (NVIDIA NIM format). */
export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiChatRequest {
  messages: AiChatMessage[];
  /** Overrides the configured default model for this call. */
  model?: string;
  /** Defaults are conservative; deterministic-ish for analysis tasks. */
  temperature?: number;
  maxTokens?: number;
}

export interface AiChatResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AiEmbeddingRequest {
  texts: string[];
  /** Overrides the configured embedding model for this call. */
  model?: string;
}

/** One vector per input text, in the same order. */
export type AiEmbeddingResponse = number[][];
