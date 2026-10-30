import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { getMDXComponents } from "@/components/docs/mdx";
import { source } from "@/lib/source";

/**
 * 문서는 빌드 때 모두 만들어 두는 정적 페이지라, 이동할 때 잠깐 기다려도(blocking) 빠르다.
 * <Suspense> 로 감싸면 문서 → 문서 이동마다 본문·목차가 비었다 다시 차서 화면이 흔들린다.
 */
export const instant = false;

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: PageProps<"/docs/[[...slug]]">): Promise<Metadata> {
  const { slug } = await props.params;
  const page = source.getPage(slug);
  if (!page) notFound();
  return { title: `${page.data.title} · 지표 설명`, description: page.data.description };
}

export default async function Page(props: PageProps<"/docs/[[...slug]]">) {
  const { slug } = await props.params;
  const page = source.getPage(slug);
  if (!page) notFound();
  const MDX = page.data.body;
  return (
    <DocsPage toc={page.data.toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}
