# Synthetic knowledge base

Every document here is **synthetic**: written for this demonstration, about
fictional properties, with invented thresholds. None of it is a real policy and
none of it derives from any real company's documents.

Each file has front matter (`title`, `slug`, `department`, `document_type`,
`region`, `version`, `status`) and numbered sections. Sections are the unit of
retrieval and citation, so a plan can cite "Housekeeping Resource Efficiency
SOP v2 §4.3".

Only documents with `status: approved` are ever retrieved. The superseded
v1 housekeeping SOP exists to prove that filter works.

Ingest with `npm run knowledge:ingest`.
