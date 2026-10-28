/**
 * 구글 서비스 계정(dashboard-sync) 로그인. 시트·GA4·서치 콘솔이 같이 쓴다.
 * 배포 환경은 GOOGLE_SERVICE_ACCOUNT_JSON(키 내용), 로컬은 키 파일.
 * JWT 의 keyFile 옵션은 v11 에서 이메일을 채우지 않아 "account not found" 가 나므로 직접 읽어 넘긴다.
 */
import { readFileSync } from "node:fs";
import { JWT } from "google-auth-library";

const DEFAULT_KEY_FILE = ".secrets/google-service-account.json";

export function googleJwt(scopes: string[]) {
  const json =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ??
    readFileSync(
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ?? DEFAULT_KEY_FILE,
      "utf8",
    );
  const key = JSON.parse(json) as {
    client_email: string;
    private_key: string;
    private_key_id: string;
  };
  return new JWT({
    email: key.client_email,
    key: key.private_key,
    keyId: key.private_key_id,
    scopes,
  });
}
