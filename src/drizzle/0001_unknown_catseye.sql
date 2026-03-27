CREATE TABLE "bookmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"repo_connection_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"start_line" integer NOT NULL,
	"end_line" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"note" text,
	"ai_context" text,
	"color" varchar(20) DEFAULT 'blue',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_connection_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"start_line" integer NOT NULL,
	"end_line" integer NOT NULL,
	"symbol_id" uuid,
	"title" varchar(300) NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "onboarding_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"repo_connection_id" uuid NOT NULL,
	"role" varchar(100) NOT NULL,
	"completed_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_repo_connection_id_repo_connections_id_fk" FOREIGN KEY ("repo_connection_id") REFERENCES "public"."repo_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_comments" ADD CONSTRAINT "code_comments_thread_id_code_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."code_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_comments" ADD CONSTRAINT "code_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_threads" ADD CONSTRAINT "code_threads_repo_connection_id_repo_connections_id_fk" FOREIGN KEY ("repo_connection_id") REFERENCES "public"."repo_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_threads" ADD CONSTRAINT "code_threads_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_threads" ADD CONSTRAINT "code_threads_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_threads" ADD CONSTRAINT "code_threads_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_repo_connection_id_repo_connections_id_fk" FOREIGN KEY ("repo_connection_id") REFERENCES "public"."repo_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookmarks_user_id_idx" ON "bookmarks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bookmarks_repo_connection_id_idx" ON "bookmarks" USING btree ("repo_connection_id");--> statement-breakpoint
CREATE INDEX "bookmarks_file_id_idx" ON "bookmarks" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "bookmarks_user_repo_idx" ON "bookmarks" USING btree ("user_id","repo_connection_id");--> statement-breakpoint
CREATE INDEX "code_comments_thread_id_idx" ON "code_comments" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "code_comments_user_id_idx" ON "code_comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "code_threads_repo_connection_id_idx" ON "code_threads" USING btree ("repo_connection_id");--> statement-breakpoint
CREATE INDEX "code_threads_file_id_idx" ON "code_threads" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "code_threads_file_path_idx" ON "code_threads" USING btree ("file_path");--> statement-breakpoint
CREATE INDEX "code_threads_status_idx" ON "code_threads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "code_threads_created_by_id_idx" ON "code_threads" USING btree ("created_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_progress_user_repo_role_idx" ON "onboarding_progress" USING btree ("user_id","repo_connection_id","role");--> statement-breakpoint
CREATE INDEX "onboarding_progress_user_id_idx" ON "onboarding_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "onboarding_progress_repo_connection_id_idx" ON "onboarding_progress" USING btree ("repo_connection_id");