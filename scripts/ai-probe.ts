/**
 * Standalone probe for the NVIDIA AI client.
 * Runs in its OWN process (tsx) — completely independent of the dev server,
 * so it is safe to run while a background sync is in progress.
 *
 * Usage:  npx tsx scripts/ai-probe.ts
 */
import "dotenv/config";
import { aiChat, aiEmbed, isAiEnabled } from "../src/lib/ai";

async function main() {
  if (!isAiEnabled()) {
    console.error("❌ NVIDIA_API_KEY not found in environment (.env).");
    process.exit(1);
  }

  console.log("→ Chat probe...");
  const chat = await aiChat({
    messages: [
      {
        role: "system",
        content:
          "You are a terse assistant for a drilling bonus system. Reply in one short line.",
      },
      { role: "user", content: "Say hello and confirm you are reachable." },
    ],
    temperature: 0.2,
    maxTokens: 64,
  });
  console.log("✅ Chat OK");
  console.log(`   model: ${chat.model}`);
  console.log(`   reply: ${chat.content}`);
  if (chat.usage) {
    console.log(
      `   tokens: prompt=${chat.usage.promptTokens} completion=${chat.usage.completionTokens}`,
    );
  }

  console.log("→ Embeddings probe (fuzzy matching sanity check)...");
  const vectors = await aiEmbed({
    texts: ["Bodeguero", "bodeguero", "Jefe de Guardia"],
  });
  console.log(`✅ Embeddings OK — ${vectors.length} vectors of dim ${vectors[0]?.length ?? 0}`);

  if (vectors.length === 3 && vectors[0] && vectors[1] && vectors[2]) {
    const cosine = (a: number[], b: number[]) => {
      let dot = 0;
      let na = 0;
      let nb = 0;
      for (let i = 0; i < a.length; i++) {
        dot += (a[i] ?? 0) * (b[i] ?? 0);
        na += (a[i] ?? 0) ** 2;
        nb += (b[i] ?? 0) ** 2;
      }
      return dot / (Math.sqrt(na) * Math.sqrt(nb));
    };
    const sameRole = cosine(vectors[0], vectors[1]);
    const diffRole = cosine(vectors[0], vectors[2]);
    console.log(
      `   cosine("Bodeguero","bodeguero")=${sameRole.toFixed(4)}  vs  cosine("Bodeguero","Jefe de Guardia")=${diffRole.toFixed(4)}`,
    );
    if (sameRole > diffRole) {
      console.log("✅ Similarity ordering correct — good signal for fuzzy matching.");
    } else {
      console.log("⚠️ Unexpected ordering — review embedding model choice before Phase A.");
    }
  }
}

main().catch((err: unknown) => {
  console.error("❌ Probe failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
