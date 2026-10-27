import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * 로컬은 프로젝트 안의 Postgres(npm run db:start, 5433 포트), 배포는 Supabase 등의 주소.
 * 개발 서버가 파일을 고칠 때마다 연결이 새로 생기지 않게 globalThis 에 하나만 둔다.
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL 이 .env.local 에 없어요");

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };
const client = (globalForDb.pg ??= postgres(url, { max: 5 }));

export const db = drizzle({ client, schema });
