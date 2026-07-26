-- CreateEnum
CREATE TYPE "trip_status" AS ENUM ('DRAFT', 'PLANNING', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "trip_role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "trip_membership_status" AS ENUM ('ACTIVE', 'REMOVED');

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "destination" TEXT,
    "timezone" TEXT NOT NULL,
    "base_currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "start_date" DATE,
    "end_date" DATE,
    "status" "trip_status" NOT NULL DEFAULT 'PLANNING',
    "cover_image_url" TEXT,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_memberships" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "trip_role" NOT NULL,
    "status" "trip_membership_status" NOT NULL DEFAULT 'ACTIVE',
    "invited_by_id" TEXT,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trip_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_invites" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "role" "trip_role" NOT NULL DEFAULT 'MEMBER',
    "email" TEXT,
    "created_by_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "max_uses" INTEGER,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trip_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trips_status_idx" ON "trips"("status");

-- CreateIndex
CREATE INDEX "trips_deleted_at_idx" ON "trips"("deleted_at");

-- CreateIndex
CREATE INDEX "trip_memberships_user_id_status_idx" ON "trip_memberships"("user_id", "status");

-- CreateIndex
CREATE INDEX "trip_memberships_trip_id_status_idx" ON "trip_memberships"("trip_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "trip_memberships_trip_id_user_id_key" ON "trip_memberships"("trip_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_invites_token_hash_key" ON "trip_invites"("token_hash");

-- CreateIndex
CREATE INDEX "trip_invites_trip_id_revoked_at_idx" ON "trip_invites"("trip_id", "revoked_at");

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_memberships" ADD CONSTRAINT "trip_memberships_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_memberships" ADD CONSTRAINT "trip_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_invites" ADD CONSTRAINT "trip_invites_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_invites" ADD CONSTRAINT "trip_invites_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
