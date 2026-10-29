import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * 로컬은 프로젝트 안의 Postgres(npm run db:start, 5433 포트), 배포는 Supabase.
 * 개발 서버가 파일을 고칠 때마다 연결이 새로 생기지 않게 globalThis 에 하나만 둔다.
 */
function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error(
      "DATABASE_URL 이 없어요 (로컬은 .env.local, 배포는 Vercel 환경변수)",
    );

  const { hostname, port } = new URL(url);
  const local = hostname === "localhost" || hostname === "127.0.0.1";

  const pooler = port === "6543";
  const client = postgres(url, {
    max: 10,
    ssl: local ? false : "require",
    // Supabase Transaction pooler(6543)는 prepared statement 를 지원하지 않는다
    prepare: !pooler,
    // 연결이 모자라면 postgres.js 는 한 연결에 쿼리를 줄줄이 이어 보내는데(파이프라이닝),
    // Transaction pooler 에서는 이게 응답 없이 멈춘다(화면이 "불러오는 중"에서 안 넘어감).
    // 0 이면 앞 쿼리가 끝난 연결에만 다음 쿼리를 보낸다(2026-10-29: 켜면 6/6 멈춤, 끄면 0/6).
    ...(pooler && { max_pipeline: 0 }),
  });
  return drizzle({ client, schema });
}

type Db = ReturnType<typeof createDb>;
const store = globalThis as unknown as { db?: Db };

/**
 * 처음 쓰는 순간에 연결한다. import 만으로는 연결하지 않아서, DATABASE_URL 이 없는 빌드 환경
 * (Vercel 빌드 단계 등)에서도 빌드가 멈추지 않는다.
 */
export const db = new Proxy({} as Db, {
  get(_, prop) {
    const real = (store.db ??= createDb());
    const value = Reflect.get(real, prop);
    // select·transaction 같은 메서드만 묶는다. $client(postgres 연결)는 그 자체가 함수라 그대로 돌려준다
    return typeof value === "function" && !Object.hasOwn(real, prop)
      ? value.bind(real)
      : value;
  },
});
