import { createCn } from "cn/config";

/**
 * 토스 디자인 시스템 글자 크기(text-t1~t7, text-st12)를 '글자 크기'로 알려 준다.
 * 이걸 안 하면 text-st12 를 글자 색으로 오해해서 같이 쓴 text-bad·text-good 같은 색을 지워 버린다.
 */
export const cn = createCn({
  extend: { classGroups: { "font-size": [{ text: ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "st12"] }] } },
});
