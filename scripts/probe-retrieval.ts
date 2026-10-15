// Prints what retrieval returns for a few representative cases, with raw
// similarity scores and NO similarity floor, so the floor can be calibrated
// against the real embedding model.
//   npm run knowledge:probe
import { loadEnvConfig } from "@next/env";
import type { SustainabilityCaseInput } from "../lib/types";
import { getDb } from "../lib/server/db";
import { defaultMinScore, getEmbedder } from "../lib/server/embeddings";
import { getEnv } from "../lib/server/env";
import { retrieveSources } from "../lib/server/knowledge";

loadEnvConfig(process.cwd());

const property = "Harbour House Singapore";

const cases: Array<{ name: string; relevant: boolean; input: SustainabilityCaseInput }> = [
  {
    name: "Housekeeping: laundry above baseline",
    relevant: true,
    input: {
      property,
      department: "Housekeeping",
      issue: "Laundry usage increased above baseline",
      currentMetric: "18% increase in laundry volume",
      targetMetric: "Return to baseline within 60 days",
      operationalContext: "Inconsistent towel reuse adoption and unclear staff communication",
    },
  },
  {
    name: "F&B: breakfast pastry waste",
    relevant: true,
    input: {
      property,
      department: "Food & Beverage",
      issue: "Breakfast buffet croissant waste is high",
      currentMetric: "14% of pastry produced is unsold",
      targetMetric: "Below 8% within 30 days",
      operationalContext: "Large trays are put out at the start of service and replenished late.",
    },
  },
  {
    name: "Engineering: low-occupancy energy",
    relevant: true,
    input: {
      property,
      department: "Engineering",
      issue: "Lightly used floors still have air-conditioning and lighting on",
      currentMetric: "Occupancy below 45% for several nights",
      targetMetric: "Reduce kWh per occupied room",
      operationalContext: "Front Office assigns rooms across all floors, so unused floors cannot be set back.",
    },
  },
  {
    name: "Procurement: supplier screening",
    relevant: true,
    input: {
      property,
      department: "Procurement",
      issue: "Sustainability criteria are not used when choosing suppliers",
      currentMetric: "No scorecard in use",
      targetMetric: "Screen all high-impact categories",
      operationalContext: "Buyers compare on price and availability only.",
    },
  },
  {
    name: "OFF-TOPIC (Sales & Marketing): quantum chess",
    relevant: false,
    input: {
      property,
      department: "Sales & Marketing",
      issue: "Quantum chess tournament scheduling",
      currentMetric: "Seventeen grandmasters",
      targetMetric: "Zero overlapping rounds",
      operationalContext: "Venue acoustics and trophy engraving.",
    },
  },
  {
    name: "OFF-TOPIC (Housekeeping): staff birthday party",
    relevant: false,
    input: {
      property,
      department: "Housekeeping",
      issue: "Planning the annual staff birthday party",
      currentMetric: "Forty guests expected",
      targetMetric: "Book a venue and a band",
      operationalContext: "Cake flavours and party playlist are undecided.",
    },
  },
];

async function main() {
  const env = getEnv();
  const embedder = getEmbedder(env);
  const floor = env.RETRIEVAL_MIN_SCORE ?? defaultMinScore(embedder);
  const db = getDb();

  console.log(`embedder: ${embedder.model}   current floor: ${floor}\n`);

  for (const testCase of cases) {
    const { sources } = await retrieveSources(db, testCase.input, {
      embedder,
      topK: 5,
      minScore: -1,
    });

    console.log(`${testCase.relevant ? "RELEVANT " : "OFF-TOPIC"}  ${testCase.name}`);

    for (const source of sources) {
      const mark = source.score >= floor ? "kept   " : "dropped";
      console.log(
        `   ${source.score.toFixed(3)}  ${mark}  ${source.documentTitle} v${source.documentVersion} ${source.sectionRef} ${source.heading}`,
      );
    }

    console.log("");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Probe failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
