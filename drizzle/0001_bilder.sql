CREATE TABLE "cabin_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cabin_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"full" "bytea" NOT NULL,
	"thumb" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cabin_photo" ADD CONSTRAINT "cabin_photo_cabin_id_cabin_id_fk" FOREIGN KEY ("cabin_id") REFERENCES "public"."cabin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cabin_photo_cabin_idx" ON "cabin_photo" USING btree ("cabin_id","position");