// Parses ./knowledge/*.md, embeds every section and stores it in the database.
//   npm run knowledge:ingest
// Uses EMBEDDINGS_PROVIDER (openai by default; "hash" needs no API key).
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { KnowledgeParseError, parseKnowledgeDocument } from "../lib/knowledge/parse";
import { getDb } from "../lib/server/db";
import { getEmbedder } from "../lib/server/embeddings";
import { getEnv } from "../lib/server/env";
import { ingestDocuments } from "../lib/server/knowledge";

loadEnvConfig(process.cwd());

async function main() {
  const directory = path.resolve(process.cwd(), "knowledge");
  const files = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".md") && file.toLowerCase() !== "readme.md")
    .sort();
  const documents = files.map((file) =>
    parseKnowledgeDocument(
      fs.readFileSync(path.join(directory, file), "utf8"),
      file,
    ),
  );
  const embedder = getEmbedder(getEnv());

  console.log(
    `Ingesting ${documents.length} documents (${documents.reduce((n, d) => n + d.chunks.length, 0)} sections) with ${embedder.model} ...`,
  );

  const summary = await ingestDocuments(getDb(), documents, embedder);

  console.log(
    `Done: ${summary.inserted} new, ${summary.updated} updated, ${summary.unchanged} unchanged; ${summary.chunks} sections embedded.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(
      error instanceof KnowledgeParseError
        ? `Invalid knowledge document: ${error.message}`
        : `Ingestion failed: ${error instanceof Error ? error.message : String(error)}${
            error instanceof Error && error.cause instanceof Error
              ? `\n  caused by: ${error.cause.message}`
              : ""
          }`,
    );
    process.exit(1);
  });
