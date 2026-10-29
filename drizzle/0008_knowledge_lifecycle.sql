ALTER TABLE "knowledge_documents" DROP CONSTRAINT "knowledge_documents_status_check";--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "document_key" text;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "origin" text DEFAULT 'corpus' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "seed_status" text;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "index_status" text;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "index_error" text;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "source_markdown" text;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_documents_key_version_idx" ON "knowledge_documents" USING btree ("document_key","version");--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_origin_check" CHECK ("knowledge_documents"."origin" in ('corpus', 'user'));--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_index_status_check" CHECK ("knowledge_documents"."index_status" is null or "knowledge_documents"."index_status" in ('processing', 'available', 'failed'));--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_status_check" CHECK ("knowledge_documents"."status" in ('approved', 'draft', 'superseded', 'withdrawn'));--> statement-breakpoint
-- Data migration. Existing documents are corpus documents. Versions of one
-- document share a key: the housekeeping SOP's v1 lives under a "-v1" slug.
UPDATE "knowledge_documents"
SET "document_key" = regexp_replace("slug", '-v[0-9]+$', ''),
    "seed_status" = "status",
    "index_status" = CASE WHEN "status" IN ('approved', 'superseded') THEN 'available' ELSE NULL END
WHERE "document_key" IS NULL;
--> statement-breakpoint
ALTER TABLE "knowledge_documents" ALTER COLUMN "document_key" SET NOT NULL;
