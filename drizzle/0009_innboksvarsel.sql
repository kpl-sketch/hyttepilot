CREATE TABLE "job_state" (
	"key" text PRIMARY KEY NOT NULL,
	"mark" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
