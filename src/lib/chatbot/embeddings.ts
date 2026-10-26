/** Contract for a real, opt-in local engine. No remote inference or synthetic vectors. */
export const EMBEDDING_SPEC = {
  model: "intfloat/multilingual-e5-small",
  dimensions: 384,
  queryPrefix: "query: ",
  passagePrefix: "passage: ",
  pooling: "mean",
  normalization: "l2",
  maxTokens: 512,
} as const;
export type EmbeddingEngine = {
  embed: (text: string, purpose: "query" | "passage") => Promise<number[]>;
};
export function validateEmbedding(vector: number[]) {
  if (vector.length !== 384 || vector.some((v) => !Number.isFinite(v)))
    return false;
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return Math.abs(norm - 1) < 0.005;
}
export async function optionalEmbedding(
  text: string,
  purpose: "query" | "passage",
  engine?: EmbeddingEngine,
): Promise<number[] | null> {
  if (!engine) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const prepared =
      (purpose === "query"
        ? EMBEDDING_SPEC.queryPrefix
        : EMBEDDING_SPEC.passagePrefix) + text;
    const vector = await Promise.race([
      engine.embed(prepared, purpose),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(Error("embedding_timeout")),
          purpose === "query" ? 1500 : 10000,
        );
        timer.unref?.();
      }),
    ]);
    return validateEmbedding(vector) ? vector : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export function reciprocalRankFusion<T extends { id: string }>(
  lists: T[][],
  k = 60,
): T[] {
  const ranks = new Map<string, { item: T; score: number }>();
  for (const list of lists)
    for (const [rank, item] of list.entries()) {
      const previous = ranks.get(item.id);
      ranks.set(item.id, {
        item: previous?.item ?? item,
        score: (previous?.score ?? 0) + 1 / (k + rank + 1),
      });
    }
  return [...ranks.values()]
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .map((r) => r.item);
}
