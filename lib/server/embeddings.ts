import OpenAI from "openai";
import { ApiError } from "./api";
import { EMBEDDING_DIMENSIONS } from "./db/schema";
import type { ServerEnv } from "./env";

/** Turns text into vectors. The model name is stored beside every vector. */
export type Embedder = {
  model: string;
  embed(texts: string[]): Promise<number[][]>;
};

// ---- deterministic, offline embedder --------------------------------------
// Feature hashing of stemmed words and word pairs into a fixed-size vector.
// It has no semantic knowledge (synonyms do not match) but needs no network,
// so tests, CI and the end-to-end suite are free and reproducible. It is not
// a substitute for a real model in production.

const STOP_WORDS = new Set(
  (
    "a an and are as at be by for from has have in is it its of on or that the " +
    "to was were will with this these those not no but if than then so we our " +
    "their they you your can may must should shall also any all each per"
  ).split(" "),
);

function stem(word: string) {
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
  return word;
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}

export function hashEmbed(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const words = (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((word) => !STOP_WORDS.has(word))
    .map(stem);

  const add = (feature: string, weight: number) => {
    const hash = fnv1a(feature);
    const sign = (hash >>> 31) & 1 ? -1 : 1;
    vector[hash % EMBEDDING_DIMENSIONS] += sign * weight;
  };

  words.forEach((word, index) => {
    add(word, 1);

    if (index > 0) {
      add(`${words[index - 1]}_${word}`, 0.5);
    }
  });

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  return norm === 0 ? vector : vector.map((value) => value / norm);
}

export const hashEmbedder: Embedder = {
  model: "hash-v1",
  embed: async (texts) => texts.map(hashEmbed),
};

// ---- OpenAI ---------------------------------------------------------------

export function createOpenAIEmbedder({
  apiKey,
  baseURL,
  model,
  timeoutMs,
}: {
  apiKey: string;
  baseURL?: string;
  model: string;
  timeoutMs: number;
}): Embedder {
  const client = new OpenAI({ apiKey, baseURL, timeout: timeoutMs, maxRetries: 1 });
  const BATCH = 64;

  return {
    model,
    async embed(texts) {
      const vectors: number[][] = [];

      for (let start = 0; start < texts.length; start += BATCH) {
        const response = await client.embeddings.create({
          model,
          input: texts.slice(start, start + BATCH),
          dimensions: EMBEDDING_DIMENSIONS,
        });

        vectors.push(
          ...response.data
            .sort((a, b) => a.index - b.index)
            .map((item) => item.embedding),
        );
      }

      return vectors;
    },
  };
}

export function getEmbedder(env: ServerEnv): Embedder {
  if (env.EMBEDDINGS_PROVIDER === "hash") {
    return hashEmbedder;
  }

  if (!env.OPENAI_API_KEY) {
    throw new ApiError(
      503,
      "embeddings_not_configured",
      "OPENAI_API_KEY is required for OpenAI embeddings (or set EMBEDDINGS_PROVIDER=hash).",
    );
  }

  return createOpenAIEmbedder({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
    model: env.EMBEDDINGS_MODEL,
    timeoutMs: env.OPENAI_TIMEOUT_MS,
  });
}

/** Default similarity floor per provider (cosine). Tunable via env. */
export function defaultMinScore(embedder: Embedder) {
  return embedder.model === hashEmbedder.model ? 0.12 : 0.28;
}
