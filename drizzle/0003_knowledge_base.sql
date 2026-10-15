-- pgvector lives in the "extensions" schema, as Supabase recommends, so it
-- does not clutter (or get exposed through) the public schema.
CREATE SCHEMA IF NOT EXISTS "extensions";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA "extensions";--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"section_ref" text NOT NULL,
	"heading" text NOT NULL,
	"content" text NOT NULL,
	"embedding_model" text NOT NULL,
	"embedding" "extensions"."vector"(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"department" text NOT NULL,
	"document_type" text NOT NULL,
	"region" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_documents_slug_unique" UNIQUE("slug"),
	CONSTRAINT "knowledge_documents_status_check" CHECK ("knowledge_documents"."status" in ('approved', 'draft', 'superseded'))
);
--> statement-breakpoint
ALTER TABLE "knowledge_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "sources" jsonb;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "grounding_status" text;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "citations_dropped" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_chunks_document_idx" ON "knowledge_chunks" USING btree ("document_id","ordinal");--> statement-breakpoint
CREATE INDEX "knowledge_documents_status_dept_idx" ON "knowledge_documents" USING btree ("status","department");