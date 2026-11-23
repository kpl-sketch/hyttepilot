CREATE TABLE "description_suggestion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cabin_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "description_suggestion" ADD CONSTRAINT "description_suggestion_cabin_id_cabin_id_fk" FOREIGN KEY ("cabin_id") REFERENCES "public"."cabin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "description_suggestion" ADD CONSTRAINT "description_suggestion_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "description_suggestion_cabin_idx" ON "description_suggestion" USING btree ("cabin_id","created_at");