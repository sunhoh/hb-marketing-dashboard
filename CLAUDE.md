# 마케팅 대시보드 — 에이전트 작업 지시서

힐링브리즈 MSO 마케팅팀이 클라이언트별 **마케팅(매체) 지표**를 한 화면에서 보는 내부 대시보드.
기획 문서: `~/Desktop/ai-content-work-vault/Projects/marketing-dashboard.md` (옵시디언 볼트)

## 현재 상태 (2026-10-30)

- **실제 데이터**로 동작한다(샘플 데이터·샘플 배지는 없앴다). 매체 API → 동기화 → DB → 화면.
- **DB**: Supabase(조직 sunhoh, 프로젝트 marketing-dashboard, 서울). 로컬 Postgres(5433)도 쓸 수 있다.
- **배포**: Vercel `hb-marketing-dashboard.vercel.app`(함수 지역 icn1). `main` 에 푸시하면 배포된다 — **사용자가 푸시하라고 할 때만 푸시**.
- **접근 제한**: 로그인 대신 사내 IP 제한(`proxy.ts`, 환경변수 `ALLOWED_IPS`). 허용 안 된 IP 는 `/api/*` 가 403 → 화면은 흐린 틀 + "사내 네트워크에서만 볼 수 있어요" 모달.
- **아직 없음**: 로그인(Auth.js), 자동 동기화(cron), CRM(KOS) 지표.

## 기술 스펙

| 항목 | 내용 |
|---|---|
| 프레임워크 | Next.js 16 (App Router, `proxy.ts`, cacheComponents) + TypeScript |
| 스타일 | Tailwind CSS + shadcn/ui(Base UI) |
| 표 | TanStack Table v9 (정렬·펼치기). **AG Grid 사용 금지** |
| 차트 | Recharts |
| 데이터 요청 | TanStack Query |
| DB | Drizzle ORM + postgres.js, 스키마 `db/schema.ts`, 마이그레이션 `db/migrations` |
| 폰트 | Pretendard |
| 패키지 매니저 | npm |

- Next.js 최신 버전은 학습 데이터와 API가 다를 수 있음. 코드 작성 전 `node_modules/next/dist/docs/`의 해당 가이드를 확인.
- 스키마를 바꾸면 `npm run db:generate` → 생성된 SQL 을 읽어 보고 → `npm run db:migrate`(`DIRECT_URL` 로 적용). 운영 DB 이므로 데이터를 지우는 변경은 사용자에게 먼저 보여 준다.
- enum 으로 묶을 수 있는 값은 `pgEnum` 으로(클라이언트·채널·국가·출처 등).

## 클라이언트와 데이터 출처

| 클라이언트 | slug | 광고 | 그 밖 |
|---|---|---|---|
| GU강남 (지유의원 강남점) | `gu-gangnam` | 메타(해외, 계정 3개), 네이버 검색광고 | GA4, 서치 콘솔, 캠페인 랜딩 GA4, 인스타 gu_clinic·gu_clinic_tw, 유튜브 |
| GU일산 (지유의원 일산점) | `gu-ilsan` | 네이버 검색광고, 메타(캠페인 이름에 "일산") | GA4, 서치 콘솔, 인스타 gu_clinic_ilsan, 유튜브 |
| 루호 (루호성형외과) | `luho` | 메타(루호성형외과 계정) | GA4, 서치 콘솔, 인스타 luho_beauty·luho_global, 유튜브 |

- **메타 계정 → 클라이언트** (`db/sync/meta.ts` `META_AD_ACCOUNTS`): 지유 글로벌(영미)·지유 대만(573926059290524)·힐링브리즈(그 외 국가) → GU강남, 루호성형외과 → 루호. GU Clinic 계정은 안 쓴다. 캠페인 이름에 "일산"이 있으면 GU일산, "강남"이면 GU강남(계정 기본값보다 먼저).
- **네이버**: 계정 하나에 지점이 섞여 있어 캠페인 → 광고그룹·연결 업체 이름 규칙으로 나눈다(`db/sync/naver-searchad.ts`). 브랜드검색은 계약형이라 일별 비용이 0 일 수 있다.
- **힐링브리즈 메타 계정은 미국 LA 시간대**다. 날짜는 계정 시간대 기준이라 서울 오후 4시 전 동기화하면 어제치가 덜 들어온다(다음 동기화가 채운다).
- 구글 시트(강남언니·크리에이트립·당근 수동 입력)는 동기화에서 잠시 뺐다(`db/sync/run-all.ts` 주석 참고).

## 동기화

- 화면 상단 [동기화] 버튼 또는 `npm run sync` — 같은 코드(`db/sync/run-all.ts`). 순서: 네이버 → 메타 → GA4·서치 콘솔(+랜딩) → 인스타그램 → 유튜브. 한 출처가 실패해도 나머지는 계속.
- 매번 최근 35일(인스타 5주)을 다시 받아 기간째 교체한다(매체가 전환·비용을 늦게 고치므로). 과거를 채울 때만 `--meta-days=210` 등.
- 오늘은 진행 중이라 **어제까지** 받는다.

## DB 주요 표

| 표 | 단위 | 비고 |
|---|---|---|
| `ad_metrics` | 날짜 × 채널 × 계정 × 캠페인 × (네이버 광고그룹 / 메타 광고 × 국가) | 소진액·노출·클릭(메타는 링크 클릭)·매체 전환 |
| `creatives` | 메타 광고(소재) | 이름·형식·상태·썸네일(64px, 주소가 며칠 뒤 만료) |
| `campaigns` | 캠페인 | 켜짐/꺼짐(동기화 시점) |
| `landing_daily` | 날짜 × utm_campaign × utm_content × 유입 경로 | 캠페인 랜딩 GA4(`campaign.gu.clinic`, 속성 522053510)의 세션 |
| `ga4_daily` | 날짜 × 클라이언트 × 소스/매체 | 세션·신규·홈페이지 전환(`lib/web-config.ts` 이벤트) |
| `gsc_daily`, `gsc_query_daily` | 날짜(× 검색어) | 평균 순위 = positionSum ÷ 노출 |
| `sns_daily`, `sns_weekly` | 계정 | 팔로워 스냅숏 / 주 조회수 |
| `youtube_videos` | 영상 | |

## 지표 — 마케팅 지표만

**포함**: 소진액, 노출, 클릭, CTR, CPC, CPM, 매체 전환, 랜딩 방문·도착률·방문당 비용, 홈페이지 유입·전환(GA4), 구글 검색(서치 콘솔), SNS 팔로워·조회수, 유튜브 업로드.

**제외 (CRM 연결 후)**: DB, 상담, 예약, 내원, 매출, CPL, CPA, ROAS — 병원 CRM(KOS) 데이터가 필요한 지표.

### 계산 규칙 (원본 값만 저장하고 파생 지표는 `lib/metrics.ts` 공통 함수로 계산)

- CTR = 클릭 ÷ 노출 × 100
- CPC = 소진액 ÷ 클릭, CPM = 소진액 ÷ 노출 × 1000
- 도착률 = 랜딩 방문 ÷ 링크 클릭 × 100, 방문당 비용 = 소진액 ÷ 랜딩 방문
- 전월 대비 증감률 = (이번 기간 − 이전 기간) ÷ 이전 기간 × 100
- 분모가 0이면 `—`. 금액은 원(₩), 천 단위 콤마.
- **증감 색은 방향만(증권식)**: ▲ 빨강 / ▼ 파랑, 비용 지표도 똑같이. "평소보다 나쁨" 표시는 주황(warn)으로 — 빨강은 "올랐다"만 뜻한다.

### 매체 전환

- 메타 = 메시지 대화 시작(`onsite_conversion.messaging_conversation_started_7d`, WhatsApp·메신저·인스타 DM) + 리드(`lead`, 인스턴트 양식). LINE·카카오·홈페이지로 보내는 광고는 메타가 전환을 모른다(0 으로 보임).
- 네이버 = 광고주센터 전환추적의 전환 수.

### 랜딩 방문 (캠페인 ↔ GA4 짝짓기)

- 광고 링크 UTM 의 `utm_campaign` = **메타 캠페인 ID**, `utm_content` = **광고 ID** 일 때만 표에 붙는다. 권장 URL 매개변수:
  `utm_source={{site_source_name}}&utm_medium=paid&utm_campaign={{campaign.id}}&utm_content={{ad.id}}`
- 이름으로 직접 쓴 UTM 은 짝을 못 지어 표 아래 "연결하지 못한 랜딩 방문"으로 센다. 도착률 5% 미만이면 숫자 대신 "UTM 확인".
- 랜딩 버튼(LINE·WhatsApp) 클릭 이벤트는 아직 없다 — 넣으면 "문의 클릭·문의당 비용"을 추가할 예정.

## 기간 (`lib/periods.ts` `resolvePeriod`)

| 필터 | 기간 | 비교 |
|---|---|---|
| 이번 달 | 1일 ~ 어제 | 지난달 1일 ~ 같은 날짜 |
| 지난달 | 그 달 전체 | 그 전 달 전체 |
| 최근 12주 | 11주 전 월요일 ~ 어제 | 바로 앞 84일 |

- 날짜 그대로 자른다(매체 광고 관리자와 같은 기준). 주별 추이 차트만 주 단위이고, 기간에 일부만 걸친 주는 중간 색 + 툴팁.
- SNS 조회수는 주 단위로만 있어서 월요일이 기간 안에 있는 주로 계산한다.

## 화면 구성 (`components/dashboard`)

1. **상단**: 마지막 동기화 시각 + [동기화] 버튼(진행 모달), 클라이언트 탭, 기간(이번 달 / 지난달 / 최근 12주). 마지막 선택은 localStorage(try/catch).
2. **요약 카드 6개**: 소진액 · 노출 · 클릭 · CTR · CPC · CPM, 전월 대비.
3. **주별 추이**: 최근 12주 소진액(막대) + CTR·CPC(선).
4. **채널별 효율 표**: [캠페인별 | 국가별] 전환(기억).
   - 캠페인별: 캠페인 → 펼치면 소재(네이버는 광고그룹). 꺼진 캠페인·소재 "꺼짐", 메타 계정이 여럿이면 계정 이름. 랜딩 GA4 가 있는 클라이언트는 랜딩 방문·도착률·방문당 비용 칸.
   - 국가별: 채널 · 국가(네이버는 캠페인) → 펼치면 캠페인. 국가는 **광고를 본 사람이 있던 나라**(타겟 국가 아님).
   - 정렬, 직전 12주보다 20% 이상 나쁜 칸은 주황.
5. **홈페이지 유입(GA4)**, **메타 소재 순위**(OFF 후보), **오가닉**(SNS 팔로워·조회수, 유튜브, 구글 검색).

라우트: `/` 는 마지막으로 본 클라이언트로 이동, `/clients/[slug]` 클라이언트 화면. 화면 데이터는 `/api/metrics` → `lib/data.ts` `getMetrics()` → `db/dataset.ts`(DB 읽기) + `lib/build-metrics.ts`(순수 계산).

## 지표 설명 문서 (`/docs`)

- 사이드바: 대시보드와 문서가 같은 틀(`components/app-shell.tsx`, fumadocs DocsLayout)을 쓴다. 메뉴는 두 root 폴더(지표 설명·대시보드)라 지금 섹션의 하위 메뉴 + 다른 섹션 링크 하나만 보인다(문서 폴더가 먼저여야 /docs 가 문서 쪽으로 찾아짐). 대시보드 화면은 `ShellMain` 으로 본문 칸에 놓는다(`min-w-0` 없으면 모바일 가로 스크롤).
- Fumadocs. 본문은 `content/docs/*.mdx`(사용자가 직접 고친다), 메뉴 순서는 `content/docs/meta.json`.
- 문턱값·전환 이벤트·유입 이름 규칙 표는 `components/docs/live.tsx` 가 코드 상수를 직접 읽는다 — 상수를 새로 만들면 여기에도 연결.
- 계산·기간·화면 규칙을 바꾸면 해당 `.mdx` 문장도 같이 고친다.
- 다크모드는 시스템 설정만(`RootProvider theme` 끔, `globals.css` 에서 dark variant 를 fumadocs 뒤에 다시 선언). 문서 페이지는 IP 제한 밖이라 계정 ID·키 같은 값은 쓰지 않는다.

## 주의할 점 (겪은 문제)

- **Supabase Transaction pooler(6543) + postgres.js 파이프라이닝 = 멈춤.** 화면 읽기는 `readDb`(`max_pipeline: 0`)만 쓴다. `max_pipeline: 0` 은 트랜잭션을 깨뜨리므로 동기화는 `db`(기본 설정). 자세한 이유는 `db/index.ts` 주석.
- `db` 는 처음 쓸 때 연결한다(빌드 때 `DATABASE_URL` 이 없어도 되게). 개발 서버는 연결을 globalThis 에 두므로 연결 설정을 바꾸면 개발 서버를 다시 켠다.
- 메타 Graph API v26: `ids=` 파라미터는 막혔다(광고 정보는 `/{act}/ads` 목록 + 개별 조회). 일시 오류(#1·#2)·호출 한도는 재시도.
- 숫자를 바꾸는 작업은 바꾸기 전후 화면 데이터(클라이언트 3 × 기간 3)를 비교해 합계가 맞는지 확인한다.

## 비밀값

- `.env.local`, `.secrets/` 는 git 제외. 키·토큰·비밀번호를 채팅이나 커밋에 쓰지 않는다. 값을 출력할 땐 가린다.
- 주요 키: `DATABASE_URL`(6543), `DIRECT_URL`(5432, 마이그레이션), `META_ACCESS_TOKEN`, `NAVER_SEARCHAD_*`, `GOOGLE_SERVICE_ACCOUNT_JSON`(로컬은 `.secrets/google-service-account.json`), `YOUTUBE_*`, `ALLOWED_IPS`(Vercel 에만).
- 구글 서비스 계정 `dashboard-sync@sigma-sector-512904-g3.iam.gserviceaccount.com` 을 GA4 속성(뷰어)·서치 콘솔에 추가해야 읽을 수 있다.
- 외부 서비스(메타·Vercel·Supabase·GA4 등) 설정은 사용자 허락 없이 바꾸지 않는다.

## 화면 품질

- PC 3열 / 태블릿 2열 / 모바일 1열, 모바일 가로 스크롤 없음(표는 표 영역 안에서만 가로 스크롤).
- 다크모드 지원(시스템 설정 따름). 한국어 UI.
- `npm run build` 성공, 타입 오류 없음.

## 다음 후보

- 랜딩 버튼 클릭 이벤트 → 문의 클릭·문의당 비용, 메타 픽셀
- 소재 큰 이미지·문구(썸네일은 64px·만료)
- 자동 동기화(cron), Auth.js 로그인, CRM(KOS) 연결 — 예약 생성일과 내원일은 반드시 분리 저장
