CREATE TABLE "join_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"has_cabin" boolean NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reminded_at" timestamp with time zone,
	"invited_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"decided_by" text,
	"invitation_id" uuid
);
--> statement-breakpoint
ALTER TABLE "join_request" ADD CONSTRAINT "join_request_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_request" ADD CONSTRAINT "join_request_invitation_id_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "join_request_open_idx" ON "join_request" USING btree ("email") WHERE "join_request"."invited_at" is null and "join_request"."declined_at" is null;--> statement-breakpoint
CREATE INDEX "join_request_created_idx" ON "join_request" USING btree ("created_at");