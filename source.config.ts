import { defineConfig, defineDocs } from "fumadocs-mdx/config";

/** 지표 설명 문서(/docs). MDX 는 content/docs 에 둔다 */
export const docs = defineDocs({ dir: "content/docs" });

export default defineConfig();
