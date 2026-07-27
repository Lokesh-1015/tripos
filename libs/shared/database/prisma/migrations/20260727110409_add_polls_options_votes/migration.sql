-- CreateEnum
CREATE TYPE "poll_subject" AS ENUM ('DESTINATION', 'DATES', 'ACTIVITY', 'RESTAURANT', 'ACCOMMODATION', 'GENERAL');

-- CreateEnum
CREATE TYPE "poll_kind" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE');

-- CreateEnum
CREATE TYPE "poll_status" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "polls" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "subject" "poll_subject" NOT NULL,
    "kind" "poll_kind" NOT NULL DEFAULT 'SINGLE_CHOICE',
    "status" "poll_status" NOT NULL DEFAULT 'OPEN',
    "question" TEXT NOT NULL,
    "closes_at" TIMESTAMPTZ(6),
    "allow_member_options" BOOLEAN NOT NULL DEFAULT true,
    "decided_option_id" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_options" (
    "id" TEXT NOT NULL,
    "poll_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" TEXT NOT NULL,
    "poll_id" TEXT NOT NULL,
    "option_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "polls_decided_option_id_key" ON "polls"("decided_option_id");

-- CreateIndex
CREATE INDEX "polls_trip_id_status_idx" ON "polls"("trip_id", "status");

-- CreateIndex
CREATE INDEX "poll_options_poll_id_idx" ON "poll_options"("poll_id");

-- CreateIndex
CREATE INDEX "votes_poll_id_user_id_idx" ON "votes"("poll_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "votes_option_id_user_id_key" ON "votes"("option_id", "user_id");

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_decided_option_id_fkey" FOREIGN KEY ("decided_option_id") REFERENCES "poll_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
