CREATE TABLE "branch_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_connection_id" uuid NOT NULL,
	"branch_name" varchar(255) NOT NULL,
	"source_branch" varchar(255) NOT NULL,
	"commit_sha" varchar(40),
	"commit_message" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"suggested_change_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"content" text NOT NULL,
	"start_line" integer NOT NULL,
	"end_line" integer NOT NULL,
	"symbol_id" uuid,
	"token_count" integer NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repo_connection_id" uuid NOT NULL,
	"title" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chunk_id" uuid NOT NULL,
	"vector" vector(1536) NOT NULL,
	"model" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "embeddings_chunk_id_unique" UNIQUE("chunk_id")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_connection_id" uuid NOT NULL,
	"path" text NOT NULL,
	"language" varchar(100),
	"size_bytes" integer NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"line_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "index_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_connection_id" uuid NOT NULL,
	"job_type" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"retrieval_trace" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"github_repo_id" bigint NOT NULL,
	"owner" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"default_branch" varchar(255) DEFAULT 'main' NOT NULL,
	"clone_path" text NOT NULL,
	"indexed_commit_sha" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_connection_id" uuid NOT NULL,
	"summary_text" text NOT NULL,
	"component_list" jsonb NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"commit_sha" varchar(40) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repo_summaries_repo_connection_id_unique" UNIQUE("repo_connection_id")
);
--> statement-breakpoint
CREATE TABLE "suggested_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"diff_text" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symbol_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_symbol_id" uuid NOT NULL,
	"to_symbol_id" uuid NOT NULL,
	"relation_type" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symbols" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"name" varchar(500) NOT NULL,
	"kind" varchar(50) NOT NULL,
	"start_line" integer NOT NULL,
	"end_line" integer NOT NULL,
	"parent_symbol_id" uuid,
	"signature" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" bigint NOT NULL,
	"github_login" varchar(255) NOT NULL,
	"github_access_token" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "branch_actions" ADD CONSTRAINT "branch_actions_repo_connection_id_repo_connections_id_fk" FOREIGN KEY ("repo_connection_id") REFERENCES "public"."repo_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_repo_connection_id_repo_connections_id_fk" FOREIGN KEY ("repo_connection_id") REFERENCES "public"."repo_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_chunk_id_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_repo_connection_id_repo_connections_id_fk" FOREIGN KEY ("repo_connection_id") REFERENCES "public"."repo_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "index_jobs" ADD CONSTRAINT "index_jobs_repo_connection_id_repo_connections_id_fk" FOREIGN KEY ("repo_connection_id") REFERENCES "public"."repo_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_connections" ADD CONSTRAINT "repo_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_summaries" ADD CONSTRAINT "repo_summaries_repo_connection_id_repo_connections_id_fk" FOREIGN KEY ("repo_connection_id") REFERENCES "public"."repo_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggested_changes" ADD CONSTRAINT "suggested_changes_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggested_changes" ADD CONSTRAINT "suggested_changes_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_relations" ADD CONSTRAINT "symbol_relations_from_symbol_id_symbols_id_fk" FOREIGN KEY ("from_symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_relations" ADD CONSTRAINT "symbol_relations_to_symbol_id_symbols_id_fk" FOREIGN KEY ("to_symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbols" ADD CONSTRAINT "symbols_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbols" ADD CONSTRAINT "symbols_parent_symbol_id_symbols_id_fk" FOREIGN KEY ("parent_symbol_id") REFERENCES "public"."symbols"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "branch_actions_repo_connection_id_idx" ON "branch_actions" USING btree ("repo_connection_id");--> statement-breakpoint
CREATE INDEX "branch_actions_status_idx" ON "branch_actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "chunks_file_id_idx" ON "chunks" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "chunks_symbol_id_idx" ON "chunks" USING btree ("symbol_id");--> statement-breakpoint
CREATE INDEX "chunks_content_hash_idx" ON "chunks" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "conversations_workspace_id_idx" ON "conversations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "conversations_repo_connection_id_idx" ON "conversations" USING btree ("repo_connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "embeddings_chunk_id_idx" ON "embeddings" USING btree ("chunk_id");--> statement-breakpoint
CREATE UNIQUE INDEX "files_repo_connection_id_path_idx" ON "files" USING btree ("repo_connection_id","path");--> statement-breakpoint
CREATE INDEX "files_repo_connection_id_idx" ON "files" USING btree ("repo_connection_id");--> statement-breakpoint
CREATE INDEX "files_language_idx" ON "files" USING btree ("language");--> statement-breakpoint
CREATE INDEX "index_jobs_repo_connection_id_idx" ON "index_jobs" USING btree ("repo_connection_id");--> statement-breakpoint
CREATE INDEX "index_jobs_status_idx" ON "index_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_role_idx" ON "messages" USING btree ("role");--> statement-breakpoint
CREATE INDEX "repo_connections_workspace_id_idx" ON "repo_connections" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "repo_connections_github_repo_id_idx" ON "repo_connections" USING btree ("github_repo_id");--> statement-breakpoint
CREATE INDEX "repo_connections_status_idx" ON "repo_connections" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "repo_summaries_repo_connection_id_idx" ON "repo_summaries" USING btree ("repo_connection_id");--> statement-breakpoint
CREATE INDEX "suggested_changes_conversation_id_idx" ON "suggested_changes" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "suggested_changes_message_id_idx" ON "suggested_changes" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "suggested_changes_status_idx" ON "suggested_changes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "symbol_relations_from_symbol_id_idx" ON "symbol_relations" USING btree ("from_symbol_id");--> statement-breakpoint
CREATE INDEX "symbol_relations_to_symbol_id_idx" ON "symbol_relations" USING btree ("to_symbol_id");--> statement-breakpoint
CREATE INDEX "symbol_relations_relation_type_idx" ON "symbol_relations" USING btree ("relation_type");--> statement-breakpoint
CREATE INDEX "symbols_file_id_idx" ON "symbols" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "symbols_name_idx" ON "symbols" USING btree ("name");--> statement-breakpoint
CREATE INDEX "symbols_kind_idx" ON "symbols" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "symbols_parent_symbol_id_idx" ON "symbols" USING btree ("parent_symbol_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_github_id_idx" ON "users" USING btree ("github_id");--> statement-breakpoint
CREATE INDEX "users_github_login_idx" ON "users" USING btree ("github_login");--> statement-breakpoint
CREATE INDEX "workspaces_user_id_idx" ON "workspaces" USING btree ("user_id");