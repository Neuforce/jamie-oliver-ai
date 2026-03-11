-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "identity_provider" AS ENUM ('supertab');

-- CreateEnum
CREATE TYPE "offering_status" AS ENUM ('draft', 'active', 'inactive');

-- CreateEnum
CREATE TYPE "purchase_provider" AS ENUM ('supertab');

-- CreateEnum
CREATE TYPE "purchase_status" AS ENUM ('pending', 'completed', 'abandoned', 'refunded');

-- CreateEnum
CREATE TYPE "entitlement_status" AS ENUM ('active', 'pending', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "cooking_session_status" AS ENUM ('active', 'paused', 'completed', 'abandoned', 'expired');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255),
    "first_name" VARCHAR(255),
    "last_name" VARCHAR(255),
    "display_name" VARCHAR(255),
    "is_guest" BOOLEAN NOT NULL DEFAULT false,
    "status" "user_status" NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "identity_provider" NOT NULL,
    "external_subject_id" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "raw_profile" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_offerings" (
    "id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "is_free" BOOLEAN NOT NULL DEFAULT false,
    "supertab_offering_id" VARCHAR(255),
    "supertab_experience_id" VARCHAR(255),
    "content_key" VARCHAR(255),
    "price_amount" INTEGER,
    "currency_code" VARCHAR(10),
    "status" "offering_status" NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "recipe_offering_id" UUID NOT NULL,
    "provider" "purchase_provider" NOT NULL,
    "provider_purchase_id" VARCHAR(255),
    "provider_offering_id" VARCHAR(255),
    "status" "purchase_status" NOT NULL DEFAULT 'pending',
    "price_amount" INTEGER,
    "currency_code" VARCHAR(10),
    "purchased_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "provider_payload" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "purchase_id" UUID,
    "provider" "purchase_provider" NOT NULL,
    "provider_content_key" VARCHAR(255),
    "status" "entitlement_status" NOT NULL DEFAULT 'active',
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,
    "recurs_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cooking_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "entitlement_id" UUID,
    "status" "cooking_session_status" NOT NULL DEFAULT 'active',
    "current_step_index" INTEGER NOT NULL DEFAULT 0,
    "completed_step_ids" JSONB NOT NULL DEFAULT '[]',
    "timer_state" JSONB,
    "snapshot_version" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paused_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cooking_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");
CREATE INDEX "users_status_idx" ON "users"("status");
CREATE INDEX "external_identities_user_id_idx" ON "external_identities"("user_id");
CREATE UNIQUE INDEX "external_identities_provider_external_subject_id_key" ON "external_identities"("provider", "external_subject_id");
CREATE INDEX "recipe_offerings_is_free_idx" ON "recipe_offerings"("is_free");
CREATE INDEX "recipe_offerings_status_idx" ON "recipe_offerings"("status");
CREATE INDEX "recipe_offerings_content_key_idx" ON "recipe_offerings"("content_key");
CREATE UNIQUE INDEX "recipe_offerings_recipe_id_key" ON "recipe_offerings"("recipe_id");
CREATE INDEX "purchases_user_id_idx" ON "purchases"("user_id");
CREATE INDEX "purchases_recipe_offering_id_idx" ON "purchases"("recipe_offering_id");
CREATE INDEX "purchases_status_idx" ON "purchases"("status");
CREATE INDEX "purchases_provider_provider_purchase_id_idx" ON "purchases"("provider", "provider_purchase_id");
CREATE INDEX "entitlements_user_id_recipe_id_idx" ON "entitlements"("user_id", "recipe_id");
CREATE INDEX "entitlements_status_idx" ON "entitlements"("status");
CREATE INDEX "entitlements_provider_content_key_idx" ON "entitlements"("provider_content_key");
CREATE INDEX "cooking_sessions_user_id_recipe_id_idx" ON "cooking_sessions"("user_id", "recipe_id");
CREATE INDEX "cooking_sessions_status_idx" ON "cooking_sessions"("status");
CREATE INDEX "cooking_sessions_last_active_at_idx" ON "cooking_sessions"("last_active_at" DESC);

-- AddForeignKey
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recipe_offerings" ADD CONSTRAINT "recipe_offerings_recipe_id_fkey"
    FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "purchases" ADD CONSTRAINT "purchases_recipe_offering_id_fkey"
    FOREIGN KEY ("recipe_offering_id") REFERENCES "recipe_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_recipe_id_fkey"
    FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_purchase_id_fkey"
    FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cooking_sessions" ADD CONSTRAINT "cooking_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cooking_sessions" ADD CONSTRAINT "cooking_sessions_recipe_id_fkey"
    FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cooking_sessions" ADD CONSTRAINT "cooking_sessions_entitlement_id_fkey"
    FOREIGN KEY ("entitlement_id") REFERENCES "entitlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
