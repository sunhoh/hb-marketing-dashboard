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

/** 사이드바: 대시보드(클라이언트별) + 지표 설명(문서 페이지) */
function navTree(): PageTree.Root {
  const docs = source.getPageTree();
  return {
    name: "마케팅 대시보드",
    children: [
      { type: "separator", name: "대시보드", icon: <LayoutDashboard /> },
      ...CLIENTS.map(
        (c): PageTree.Item => ({ type: "page", name: c.name, url: `/clients/${c.slug}` }),
      ),
      { type: "separator", name: "지표 설명", icon: <BookOpen /> },
      ...docs.children,
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
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
