CREATE TABLE "profile_photo" (
	"user_id" text PRIMARY KEY NOT NULL,
	"full" "bytea" NOT NULL,
	"thumb" "bytea" NOT NULL,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_photo" ADD CONSTRAINT "profile_photo_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;