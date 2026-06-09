CREATE TABLE IF NOT EXISTS "intake_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"use_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "intake_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"file_type" text NOT NULL,
	"s3_key" text,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"extracted_text" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"corrections_made" boolean DEFAULT false NOT NULL,
	"flagged_spans" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"chunk_text" text NOT NULL,
	"token_range" "int4range",
	"page" integer,
	"time_range" text,
	"embedding" "vector(1536)",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "processing_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"engine" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"baa_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"practitioner_id" uuid,
	"action" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intake_tokens_tenant_idx" ON "intake_tokens" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intake_tokens_patient_idx" ON "intake_tokens" ("patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_token_per_patient" ON "intake_tokens" ("patient_id") WHERE revoked_at IS NULL AND status = 'pending';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intake_documents_tenant_idx" ON "intake_documents" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intake_documents_patient_idx" ON "intake_documents" ("patient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunks_document_idx" ON "document_chunks" ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunks_tenant_idx" ON "document_chunks" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "processing_jobs_document_idx" ON "processing_jobs" ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "processing_jobs_tenant_idx" ON "processing_jobs" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_tenant_created_idx" ON "audit_log" ("tenant_id","created_at");