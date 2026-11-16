CREATE TABLE "invitation_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invitation_id" uuid NOT NULL,
	"email" text NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"declined_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "invitation_request" ADD CONSTRAINT "invitation_request_invitation_id_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_request" ADD CONSTRAINT "invitation_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_request_email_idx" ON "invitation_request" USING btree ("invitation_id","email");--> statement-breakpoint
CREATE INDEX "invitation_request_lookup_idx" ON "invitation_request" USING btree ("email");