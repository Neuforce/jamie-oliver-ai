-- Align database defaults with the Prisma schema for service-created rows.
ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4();
ALTER TABLE "external_identities" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4();
ALTER TABLE "recipe_offerings" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4();
ALTER TABLE "purchases" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4();
ALTER TABLE "entitlements" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4();
ALTER TABLE "cooking_sessions" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4();
