import { after, connection } from "next/server";
import { claimSync, getSyncState } from "@/db/sync/status";

/** 동기화 한 번에 1~3분 걸린다 */
export const maxDuration = 300;

/** 진행 상황. 서버 메모리를 읽으므로 빌드 때 미리 만들지 않게 connection() 으로 요청 시점에 돌린다 */
export async function GET() {
  await connection();
  return Response.json(getSyncState());
}

/** 동기화 시작. 이미 돌고 있으면 새로 시작하지 않고 지금 상태를 돌려준다 */
export async function POST() {
  const run = claimSync();
  if (run) after(run);
  return Response.json(getSyncState(), { status: run ? 202 : 200 });
}
