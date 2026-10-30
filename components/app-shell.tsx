import type * as PageTree from "fumadocs-core/page-tree";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import { BookOpen, LayoutDashboard } from "lucide-react";
import { CLIENTS } from "@/lib/clients";
import { source } from "@/lib/source";

/** fumadocs 기본 문구 → 한국어 */
const translations = {
  "On this page(table of contents)": "이 페이지에서",
  "No Headings(table of contents)": "제목 없음",
  "Table of Contents(inline table of contents)": "목차",
  "Previous Page(pagination)": "이전",
  "Next Page(pagination)": "다음",
  "Open Sidebar(sidebar)(aria-label)": "메뉴 열기",
  "Close Sidebar(sidebar)(aria-label)": "메뉴 닫기",
  "Collapse Sidebar(sidebar)(aria-label)": "메뉴 접기",
  "Toggle Menu(mobile menu)(aria-label)": "메뉴",
  "Copy Anchor Link(heading anchor)(aria-label)": "링크 복사",
  "Copied Anchor Link(heading anchor)(aria-label)": "링크 복사됨",
  "Copy Text(code block)(aria-label)": "복사",
  "Copied Text(code block)(aria-label)": "복사됨",
  "Page Not Found(404 page)": "페이지를 찾을 수 없어요",
  "Back to Home(404 page)": "처음으로",
};

/**
 * 사이드바: 지금 있는 섹션의 하위 메뉴 + 다른 섹션으로 가는 링크 하나.
 * 두 섹션을 root 폴더로 두면 fumadocs 가 현재 페이지가 속한 폴더만 보여 준다.
 * 지표 설명을 먼저 둔다 — 대시보드 쪽 '지표 설명' 링크(/docs)보다 문서 폴더의 /docs 가 먼저 찾아져야 해서.
 */
function navTree(): PageTree.Root {
  const docs = source.getPageTree();
  return {
    name: "마케팅 대시보드",
    children: [
      {
        type: "folder",
        root: true,
        name: "지표 설명",
        children: [
          { type: "separator", name: "지표 설명", icon: <BookOpen /> },
          ...docs.children,
          { type: "separator" },
          { type: "page", name: "대시보드", url: "/", icon: <LayoutDashboard /> },
        ],
      },
      {
        type: "folder",
        root: true,
        name: "대시보드",
        children: [
          { type: "separator", name: "대시보드", icon: <LayoutDashboard /> },
          ...CLIENTS.map(
            (c): PageTree.Item => ({ type: "page", name: c.name, url: `/clients/${c.slug}` }),
          ),
          { type: "separator" },
          { type: "page", name: "지표 설명", url: "/docs", icon: <BookOpen /> },
        ],
      },
    ],
  };
}

/** 대시보드와 문서(/docs)가 함께 쓰는 틀. 사이드바는 접을 수 있고, 모바일에서는 상단 메뉴로 연다 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    // 다크모드는 시스템 설정만 따른다(next-themes 끔) · 문서가 몇 장뿐이라 검색은 끔
    <RootProvider theme={{ enabled: false }} search={{ enabled: false }} i18n={{ locale: "ko", translations }}>
      <DocsLayout
        tree={navTree()}
        nav={{ title: "힐링브리즈 마케팅", url: "/" }}
        themeSwitch={{ enabled: false }}
        searchToggle={{ enabled: false }}
        // 섹션 전환은 사이드바 아래 링크로 한다(상단 탭 선택기 끔)
        tabs={false}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
