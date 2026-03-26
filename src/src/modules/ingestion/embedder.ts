/**
 * Embedding generation using OpenAI text-embedding-3-small.
 *
 * Processes chunks in batches of 100 with exponential backoff on rate limits.
 * Returns embeddings as 1536-dimensional vectors.
 */

import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = 100;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

// Max tokens per embedding request (8191 for text-embedding-3-small)
const MAX_TOKENS_PER_INPUT = 8191;

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return client;
}

export interface EmbeddingResult {
  chunkIndex: number;
  vector: number[];
  model: string;
}

/**
 * Generate embeddings for an array of text chunks.
 * Processes in batches of 100 with rate limit handling.
 */
export async function generateEmbeddings(
  texts: string[],
  onProgress?: (completed: number, total: number) => void,
): Promise<EmbeddingResult[]> {
  const results: EmbeddingResult[] = [];
  const totalBatches = Math.ceil(texts.length / BATCH_SIZE);

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchStart = batchIdx * BATCH_SIZE;
    const batchEnd = Math.min(batchStart + BATCH_SIZE, texts.length);
    const batchTexts = texts.slice(batchStart, batchEnd);

    // Truncate texts that exceed token limit (rough estimate: 4 chars per token)
    const truncated = batchTexts.map((t) => {
      const maxChars = MAX_TOKENS_PER_INPUT * 4;
      return t.length > maxChars ? t.slice(0, maxChars) : t;
    });

    const batchEmbeddings = await embedBatchWithRetry(truncated);

    for (let i = 0; i < batchEmbeddings.length; i++) {
      results.push({
        chunkIndex: batchStart + i,
        vector: batchEmbeddings[i],
        model: EMBEDDING_MODEL,
      });
    }

    onProgress?.(batchEnd, texts.length);
  }

  return results;
}

/**
 * Embed a single text (used for query embedding in retrieval).
 */
export async function embedQuery(text: string): Promise<number[]> {
  const results = await embedBatchWithRetry([text]);
  return results[0];
}

async function embedBatchWithRetry(texts: string[]): Promise<number[][]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await getClient().embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts,
        dimensions: EMBEDDING_DIMENSIONS,
      });

      // Sort by index to preserve order
      const sorted = response.data.sort((a, b) => a.index - b.index);
      return sorted.map((d) => d.embedding);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Check if it's a rate limit error
      const isRateLimit =
        lastError.message.includes("Rate limit") ||
        lastError.message.includes("429") ||
        (err instanceof OpenAI.APIError && err.status === 429);

      // Check if it's a server error (worth retrying)
      const isServerError =
        err instanceof OpenAI.APIError && err.status !== undefined && err.status >= 500;

      if (!isRateLimit && !isServerError) {
        throw lastError;
      }

      // Exponential backoff with jitter
      const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 1000;
      console.warn(
        `[embedder] Rate limited or server error (attempt ${attempt + 1}/${MAX_RETRIES}), ` +
          `retrying in ${Math.round(delay)}ms...`,
      );
      await sleep(delay);
    }
  }

  throw lastError ?? new Error("Embedding failed after max retries");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
