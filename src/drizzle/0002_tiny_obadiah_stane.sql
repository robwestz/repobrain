CREATE TABLE "cross_repo_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_repo_id" uuid NOT NULL,
	"to_repo_id" uuid NOT NULL,
	"relation_type" varchar(50) NOT NULL,
	"from_file_path" text NOT NULL,
	"to_file_path" text NOT NULL,
	"from_symbol_name" varchar(200),
	"to_symbol_name" varchar(200),
	"evidence" text,
	"confidence" varchar(20) DEFAULT 'medium',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cross_repo_search_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"query" text NOT NULL,
	"results" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cross_repo_relations" ADD CONSTRAINT "cross_repo_relations_from_repo_id_repo_connections_id_fk" FOREIGN KEY ("from_repo_id") REFERENCES "public"."repo_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_repo_relations" ADD CONSTRAINT "cross_repo_relations_to_repo_id_repo_connections_id_fk" FOREIGN KEY ("to_repo_id") REFERENCES "public"."repo_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cross_repo_relations_from_repo_id_idx" ON "cross_repo_relations" USING btree ("from_repo_id");--> statement-breakpoint
CREATE INDEX "cross_repo_relations_to_repo_id_idx" ON "cross_repo_relations" USING btree ("to_repo_id");--> statement-breakpoint
CREATE INDEX "cross_repo_relations_relation_type_idx" ON "cross_repo_relations" USING btree ("relation_type");--> statement-breakpoint
CREATE INDEX "cross_repo_search_cache_workspace_id_idx" ON "cross_repo_search_cache" USING btree ("workspace_id");