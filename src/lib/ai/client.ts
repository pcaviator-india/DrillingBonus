import { getAiConfig, type AiConfig } from "./config";
import type {
  AiChatRequest,
  AiChatResponse,
  AiEmbeddingRequest,
  AiEmbeddingResponse,
} from "./types";

/**
 * NVIDIA AI client — plain fetch against the OpenAI-compatible NIM API.
 * No new dependencies; server-side only (never import from client components,
 * the API key must stay off the browser).
 *
 * This module is advisory-only: it is NOT wired into the bonus engine and
 * never will be (see .clinerules — engine stays pure/deterministic).
 */

export class AiNotConfiguredError extends Error {
  constructor() {
    super("NVIDIA_API_KEY is not set — AI features are disabled.");
    this.name = "AiNotConfiguredError";
  }
}

export class AiRequestError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`NVIDIA AI request failed with status ${status}: ${body.slice(0, 500)}`);
    this.name = "AiRequestError";
    this.status = status;
    this.body = body;
  }
}

interface ChatCompletionApiResponse {
  choices?: Array<{ message?: { content?: string } }>;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface EmbeddingsApiResponse {
  data?: Array<{ index?: number; embedding?: number[] }>;
}

async function postJson<TResponse>(
  config: AiConfig,
  path: string,
  payload: Record<string, unknown>,
): Promise<TResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const res = await fetch(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      // Never cache AI calls in Next's fetch cache.
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new AiRequestError(res.status, body);
    }
    return (await res.json()) as TResponse;
  } finally {
    clearTimeout(timer);
  }
}

/** Chat completion against the configured NVIDIA chat model. */
export async function aiChat(request: AiChatRequest): Promise<AiChatResponse> {
  const config = getAiConfig();
  if (!config) throw new AiNotConfiguredError();

  const payload = {
    model: request.model ?? config.chatModel,
    messages: request.messages,
    temperature: request.temperature ?? 0.2,
    max_tokens: request.maxTokens ?? 1024,
    stream: false,
  };

  const data = await postJson<ChatCompletionApiResponse>(
    config,
    "/chat/completions",
    payload,
  );

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new AiRequestError(200, "Response contained no message content");
  }

  return {
    content,
    model: data.model ?? payload.model,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens ?? 0,
          completionTokens: data.usage.completion_tokens ?? 0,
          totalTokens: data.usage.total_tokens ?? 0,
        }
      : undefined,
  };
}

/** Embeddings against the configured NVIDIA embedding model (for fuzzy matching). */
export async function aiEmbed(request: AiEmbeddingRequest): Promise<AiEmbeddingResponse> {
  const config = getAiConfig();
  if (!config) throw new AiNotConfiguredError();
  if (request.texts.length === 0) return [];

  const payload = {
    model: request.model ?? config.embedModel,
    input: request.texts,
    input_type: "query",
  };

  const data = await postJson<EmbeddingsApiResponse>(config, "/embeddings", payload);

  const rows = [...(data.data ?? [])].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  );
  return rows.map((r) => r.embedding ?? []);
}

/** Tiny liveness probe — used by scripts/ai-probe and future health checks. */
export async function aiPing(): Promise<{ ok: boolean; model: string; reply: string }> {
  const result = await aiChat({
    messages: [
      { role: "user", content: "Reply with exactly the word: ok" },
    ],
    maxTokens: 8,
    temperature: 0,
  });
  return { ok: true, model: result.model, reply: result.content.trim().slice(0, 50) };
}
