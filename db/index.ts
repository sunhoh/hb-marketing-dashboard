import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";

/** 지금은 로컬 PGlite(.data/pglite). 배포 시 Neon 등 Postgres 주소로 이 파일만 바꾼다 */
export const db = drizzle({ connection: { dataDir: process.env.PGLITE_DIR ?? ".data/pglite" }, schema });
