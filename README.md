# 마케팅 대시보드

힐링브리즈 마케팅팀 내부 대시보드. 작업 지시서는 `CLAUDE.md`.

## 실행

```bash
npm run db:start   # 로컬 Postgres 켜기 (프로젝트 안 .data/postgres, 5433 포트)
npm run dev        # 화면
npm run db:stop    # 로컬 Postgres 끄기
```

## 데이터

| 명령 | 하는 일 |
|---|---|
| `npm run sync` | 네이버 검색광고 + 메타 광고·인스타그램 + 유튜브 + GA4·서치 콘솔 → DB |
| `npm run db:migrate` | 스키마(`db/schema.ts`) 변경을 DB에 적용 (`db:generate` 로 마이그레이션 생성 후) |
| `npm run sheet:template` | 시트 입력 양식(xlsx) 다시 만들기 |

`.env.local` (git 제외)

| 키 | 값 |
|---|---|
| `DATABASE_URL` | 화면·동기화가 쓰는 DB. 로컬은 `postgres://dashboard@localhost:5433/marketing`, Supabase 는 Transaction pooler(포트 6543) 주소 |
| `DIRECT_URL` | 마이그레이션 전용. Supabase Session pooler(포트 5432) 주소. 비우면 `DATABASE_URL` 을 쓴다 |
| `GOOGLE_SHEET_ID` | 입력 시트 ID |

서비스 계정 키는 `.secrets/google-service-account.json` (git 제외, 배포 시 `GOOGLE_SERVICE_ACCOUNT_JSON` 환경변수).
