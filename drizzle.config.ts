import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  driver: "pglite",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dbCredentials: { url: process.env.PGLITE_DIR ?? ".data/pglite" },
});
