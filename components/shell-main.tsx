/**
 * 대시보드 화면을 AppShell(fumadocs 레이아웃)의 본문 칸에 놓는다. 문서 페이지는 DocsPage 가 같은 일을 한다.
 * min-w-0 이 없으면 넓은 표가 본문 칸을 늘려 모바일에서 가로 스크롤이 생긴다.
 */
export function ShellMain({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0 [grid-area:main]">{children}</div>;
}
