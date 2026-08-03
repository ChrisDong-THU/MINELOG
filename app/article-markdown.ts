import type { SectionArticle } from "./section-articles";
import ragLatency from "../content/ai/rag-latency.md?raw";

const ARTICLE_MARKDOWN: Record<string, string> = {
  "把 RAG 延迟压到 180ms：一次检索链路重构": ragLatency,
};

export function getArticleMarkdown(article: SectionArticle) {
  return ARTICLE_MARKDOWN[article.title] ?? `
${article.summary}

> 这篇笔记记录问题的背景、判断过程与最终结论，重点保留以后仍可复用的部分。

## 问题背景

当一个熟悉的流程开始出现摩擦时，最有效的做法通常不是立刻增加工具，而是先描述当前状态、约束条件与真正需要改变的结果。

## 分析与实践

我们把过程拆成三个可以独立验证的阶段：

1. 收集事实，区分现象与原因；
2. 设计最小实验，避免一次改变太多变量；
3. 记录结果，并把有效方法沉淀为可重复的步骤。

| 检查项 | 目标 | 状态 |
| --- | --- | --- |
| 问题边界 | 明确不处理什么 | 已完成 |
| 验证方法 | 能够重复观察结果 | 已完成 |
| 后续动作 | 留下清晰的下一步 | 进行中 |

## 小结

这次实践没有追求复杂方案。真正有价值的是建立一条更短、更容易验证，也更容易在失败后恢复的路径。

---

标签：${article.tags.map((tag) => `\`${tag}\``).join(" · ")}
`;
}
