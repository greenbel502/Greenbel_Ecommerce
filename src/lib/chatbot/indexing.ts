import { optionalEmbedding, type EmbeddingEngine } from "./embeddings";
/** Bounded job processor for an explicitly configured real engine. No background server is started. */
export type EmbeddingQueue = {
  claim: () => Promise<{
    id: string;
    claimId: string;
    hash: string;
    text: string;
  } | null>;
  finish: (
    job: { id: string; claimId: string; hash: string },
    vector: number[] | null,
  ) => Promise<boolean>;
};
export async function processEmbeddingJobs(
  queue: EmbeddingQueue,
  engine?: EmbeddingEngine,
  limit = 5,
) {
  if (!engine) return { configured: false, completed: 0, failed: 0 };
  let completed = 0,
    failed = 0;
  for (let i = 0; i < Math.min(Math.max(limit, 1), 20); i++) {
    const job = await queue.claim();
    if (!job) break;
    const vector = await optionalEmbedding(job.text, "passage", engine);
    if (await queue.finish(job, vector)) completed++;
    else failed++;
  }
  return { configured: true, completed, failed };
}
