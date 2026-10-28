import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  // 마이그레이션은 pooler 를 거치지 않는 주소(Supabase Session pooler)로. 없으면 DATABASE_URL
  dbCredentials: { url: process.env.DIRECT_URL || process.env.DATABASE_URL! },
});
