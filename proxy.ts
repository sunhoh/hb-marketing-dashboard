/**
 * 사내 IP 제한. 데이터를 주는 API(/api/*)만 막는다 — 화면 틀은 보이고, 숫자는 서버에서 아예 보내지 않는다.
 * 허용 IP 는 환경변수 ALLOWED_IPS(쉼표로 구분). 비어 있으면 제한하지 않는다 — 로컬 .env.local 에는 넣지 않고 Vercel 에만 둔다.
 * 로컬에서 차단 화면을 보려면 .env.local 에 ALLOWED_IPS=1.1.1.1 처럼 아무 IP 나 잠깐 넣는다.
 */
import { NextResponse, type NextRequest } from "next/server";

export type IpBlocked = { code: "IP_NOT_ALLOWED"; ip: string | null };

function allowedIps() {
  return (process.env.ALLOWED_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Vercel 이 넣어 주는 접속자 IP. 로컬은 없을 수 있다 */
function clientIp(request: NextRequest) {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

export function proxy(request: NextRequest) {
  const allowed = allowedIps();
  if (allowed.length === 0) return NextResponse.next();
  const ip = clientIp(request);
  if (ip && allowed.includes(ip)) return NextResponse.next();
  return NextResponse.json({ code: "IP_NOT_ALLOWED", ip } satisfies IpBlocked, {
    status: 403,
  });
}

export const config = { matcher: "/api/:path*" };
