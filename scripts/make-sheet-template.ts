/**
 * 구글 시트 입력 양식(.xlsx)을 만든다. 구글 드라이브에 올려 "Google 스프레드시트로 열기"로 쓴다.
 *   npm run sheet:template  →  templates/마케팅-대시보드-입력.xlsx
 */
import ExcelJS from "exceljs";
import { mkdirSync } from "node:fs";
import { LISTS, SHEET_TABS, type ColumnKind, type SheetColumn } from "../db/sheet-spec";

const OUT_DIR = "templates";
const OUT_FILE = `${OUT_DIR}/마케팅-대시보드-입력.xlsx`;
const INPUT_ROWS = 1000; // 드롭다운·검사를 걸어 둘 행 수
const LIST_SHEET = "목록";

const HEADER_FILL = "FFF2F4F6"; // TDS grey100
const REQUIRED_FILL = "FFE8F3FF"; // TDS blue50
const NOTE_COLOR = "FF6B7684"; // TDS grey600

const NUM_FMT: Partial<Record<ColumnKind, string>> = {
  monday: "yyyy-mm-dd",
  won: "#,##0",
  int: "#,##0",
};

/** exceljs 런타임에는 있지만 타입 정의에서 빠진 범위 단위 검사 API */
type WithRangeValidations = ExcelJS.Worksheet & {
  dataValidations: { add(range: string, v: ExcelJS.DataValidation): void };
};

const listColumns = Object.keys(LISTS) as (keyof typeof LISTS)[];

function listRef(kind: keyof typeof LISTS) {
  const col = String.fromCharCode(65 + listColumns.indexOf(kind));
  return `'${LIST_SHEET}'!$${col}$2:$${col}$${LISTS[kind].length + 1}`;
}

function validation(c: SheetColumn, cell: string): ExcelJS.DataValidation | undefined {
  // 빈칸은 허용(빈 줄이 빨갛게 표시되지 않게). 필수 칸 누락은 동기화 때 검사한다
  const base = { allowBlank: true, showErrorMessage: true, errorStyle: "stop" as const };
  switch (c.kind) {
    case "client":
    case "channel":
      return { ...base, type: "list", formulae: [listRef(c.kind)], error: "목록에서 골라 주세요" };
    case "monday":
      return { ...base, type: "custom", formulae: [`AND(ISNUMBER(${cell}),WEEKDAY(${cell},2)=1)`], error: "월요일 날짜(YYYY-MM-DD)를 적어 주세요" };
    case "won":
    case "int":
      return { ...base, type: "whole", operator: "greaterThanOrEqual", formulae: [0], error: "0 이상의 정수를 적어 주세요(콤마·₩ 없이)" };
    default:
      return undefined;
  }
}

const wb = new ExcelJS.Workbook();
wb.creator = "힐링브리즈 마케팅팀";

// 안내 탭
const guide = wb.addWorksheet("안내");
guide.columns = [{ width: 18 }, { width: 90 }];
const guideRows: [string, string][] = [
  ["마케팅 대시보드 입력", ""],
  ["", ""],
  ["무엇인가요", "API 로 자동으로 가져올 수 없는 숫자를 적는 시트예요. 대시보드가 이 시트를 읽어 화면에 그려요."],
  ["적지 않는 것", "메타·네이버 검색광고는 API 로 자동 수집돼요. 이 시트에는 적지 않아요."],
  ["언제", "매주 월요일, 지난주(월~일) 숫자를 적어요. '주 시작일'은 지난주 월요일 날짜예요."],
  ["규칙 1", "한 줄 = 한 기록. 줄을 합치거나(셀 병합) 소계 줄을 넣지 마세요."],
  ["규칙 2", "숫자는 숫자만 (1,100,000 ✓ / 110만 ✗ / ₩1,100,000 ✗). 날짜는 2026-10-19 형식."],
  ["규칙 3", "탭 이름과 첫 줄(머리글)은 바꾸지 마세요. 열을 오른쪽에 추가하는 건 괜찮아요."],
  ["규칙 4", "같은 주·같은 채널을 다시 적으면 대시보드는 마지막 값으로 덮어써요. 고칠 땐 그 줄을 수정하세요."],
  ["파란 머리글", "꼭 채워야 하는 칸이에요. 회색 머리글은 없으면 비워 둬요."],
  ["", ""],
  ["탭", "설명"],
  ...SHEET_TABS.map((t): [string, string] => [t.name, t.description]),
  ["", ""],
  ["예시 (매체_수동)", "2026-10-19 | GU강남 | 강남언니 | (비움) | 1100000 | 78500 | 1890 | 170"],
];
guideRows.forEach((r) => guide.addRow(r));
guide.getCell("A1").font = { bold: true, size: 16 };
guide.getRow(12).font = { bold: true };
guide.getColumn(1).font = { bold: true };
guide.getColumn(2).alignment = { wrapText: true, vertical: "top" };

// 입력 탭
for (const tab of SHEET_TABS) {
  const ws = wb.addWorksheet(tab.name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = tab.columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? Math.max(12, c.header.length * 2 + 2),
    style: NUM_FMT[c.kind] ? { numFmt: NUM_FMT[c.kind] } : {},
  }));
  const header = ws.getRow(1);
  header.height = 22;
  tab.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.font = { bold: true };
    cell.alignment = { vertical: "middle" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.required ? REQUIRED_FILL : HEADER_FILL } };
    if (c.note) cell.note = c.note;
    // 열 전체에 규칙 하나. 수식 속 셀 주소는 범위 첫 칸(2행) 기준으로 상대 적용된다
    const letter = ws.getColumn(i + 1).letter;
    const v = validation(c, `${letter}2`);
    if (v) (ws as WithRangeValidations).dataValidations.add(`${letter}2:${letter}${INPUT_ROWS + 1}`, v);
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: tab.columns.length } };
}

// 드롭다운 목록 탭 — 클라이언트·채널이 늘면 여기에 추가
const lists = wb.addWorksheet(LIST_SHEET);
lists.columns = listColumns.map((k) => ({
  header: { client: "클라이언트", channel: "채널(수기)" }[k],
  width: 16,
}));
listColumns.forEach((k, col) => LISTS[k].forEach((v, i) => (lists.getCell(i + 2, col + 1).value = v)));
lists.getRow(1).font = { bold: true };
lists.getRow(1).getCell(1).note = "드롭다운에 쓰는 목록이에요. 항목을 바꾸면 대시보드 코드(lib/clients.ts)도 함께 바꿔야 해요.";
lists.getRow(1).font = { bold: true, color: { argb: NOTE_COLOR } };

mkdirSync(OUT_DIR, { recursive: true });
wb.xlsx.writeFile(OUT_FILE).then(() => console.log(`만들었어요: ${OUT_FILE}`));
