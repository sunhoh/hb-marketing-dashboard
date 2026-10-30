import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * 로컬은 프로젝트 안의 Postgres(npm run db:start, 5433 포트), 배포는 Supabase.
 * 개발 서버가 파일을 고칠 때마다 연결이 새로 생기지 않게 globalThis 에 하나씩만 둔다.
 *
 * 연결을 둘로 나눈다(2026-10-30).
 *   · db     — 동기화(쓰기·트랜잭션)와 그 밖의 곳. postgres.js 기본 설정.
 *   · readDb — 화면 데이터 읽기(db/dataset.ts) 전용. 파이프라이닝을 끈다.
 * 연결이 모자라면 postgres.js 는 한 연결에 쿼리를 줄줄이 이어 보내는데(파이프라이닝),
 * Supabase Transaction pooler(6543)에서는 이게 응답 없이 멈춘다(화면이 "불러오는 중"에서 안 넘어감).
 * 화면은 쿼리 여러 개를 한꺼번에, 요청끼리도 겹쳐서 보내서 이 문제가 생긴다(켜면 6/6 멈춤, 끄면 0/6).
 * 끄는 설정(max_pipeline 0)은 트랜잭션(sql.begin)을 깨뜨려서 동기화 쪽에는 쓸 수 없다.
 * 동기화는 쿼리를 하나씩 기다리며 보내서 파이프라이닝이 생기지 않는다.
 */
function createDb(read: boolean) {
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error(
      "DATABASE_URL 이 없어요 (로컬은 .env.local, 배포는 Vercel 환경변수)",
    );

  const { hostname, port } = new URL(url);
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  const pooler = port === "6543";

  const client = postgres(url, {
    max: read ? 10 : 5,
    ssl: local ? false : "require",
    // Supabase Transaction pooler(6543)는 prepared statement 를 지원하지 않는다
    prepare: !pooler,
    // 0 이면 앞 쿼리가 끝난 연결에만 다음 쿼리를 보낸다(1 도 멈춤 — 0 이어야 한다)
    ...(read && pooler && { max_pipeline: 0 }),
  });
  return drizzle({ client, schema });
}

type Db = ReturnType<typeof createDb>;
const store = globalThis as unknown as { db?: Db; readDb?: Db };

/**
 * 처음 쓰는 순간에 연결한다. import 만으로는 연결하지 않아서, DATABASE_URL 이 없는 빌드 환경
 * (Vercel 빌드 단계 등)에서도 빌드가 멈추지 않는다.
 */
function lazy(key: "db" | "readDb") {
  return new Proxy({} as Db, {
    get(_, prop) {
      const real = (store[key] ??= createDb(key === "readDb"));
      const value = Reflect.get(real, prop);
      // select·transaction 같은 메서드만 묶는다. $client(postgres 연결)는 그 자체가 함수라 그대로 돌려준다
      return typeof value === "function" && !Object.hasOwn(real, prop)
        ? value.bind(real)
        : value;
    },
  });
}

export const db = lazy("db");
/** 화면 데이터 읽기 전용 — 트랜잭션에 쓰지 않는다 */
export const readDb = lazy("readDb");
