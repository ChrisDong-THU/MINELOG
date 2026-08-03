export type SectionArticle = {
  title: string;
  summary: string;
  date: string;
  read: string;
  tags: string[];
};

export const SECTION_ARTICLES: Record<string, SectionArticle[]> = {
  ai: [
    { title: "把 RAG 延迟压到 180ms：一次检索链路重构", summary: "从召回、重排到生成链路，记录一次面向真实流量的性能重构。", date: "08.02", read: "12 MIN", tags: ["RAG", "性能"] },
    { title: "Agentic Memory：长程任务中的记忆分层", summary: "拆解工作记忆、情景记忆与长期知识之间的协作边界。", date: "07.27", read: "9 MIN", tags: ["Agent", "Memory"] },
    { title: "用评测集约束提示词回归", summary: "把主观的提示词调整转化为可以持续验证的工程流程。", date: "07.16", read: "8 MIN", tags: ["评测", "Prompt"] },
  ],
  web: [
    { title: "流式界面中的状态边界与错误恢复", summary: "让加载、局部失败与重试在流式渲染中保持可预测。", date: "07.29", read: "8 MIN", tags: ["React", "Streaming"] },
    { title: "Server Actions 的边界与适用场景", summary: "从缓存、权限和错误处理三个角度判断服务端操作的使用位置。", date: "07.20", read: "10 MIN", tags: ["Next.js", "服务端"] },
    { title: "用容器查询构建真正独立的组件", summary: "让组件依据自身空间响应，而不是继续依赖页面级断点。", date: "07.08", read: "6 MIN", tags: ["CSS", "响应式"] },
  ],
  data: [
    { title: "PostgreSQL JSONB 索引的真实成本", summary: "比较 GIN 索引、表达式索引和写入放大在不同负载下的代价。", date: "07.24", read: "10 MIN", tags: ["PostgreSQL", "索引"] },
    { title: "增量数据管道的幂等设计", summary: "从检查点、去重键和迟到数据出发，设计可恢复的数据任务。", date: "07.12", read: "11 MIN", tags: ["ETL", "数据管道"] },
    { title: "从查询计划定位慢 SQL", summary: "用执行计划识别错误估算、无效扫描与内存瓶颈。", date: "06.30", read: "9 MIN", tags: ["SQL", "性能"] },
  ],
  systems: [
    { title: "从单体服务到事件驱动：知识索引的演进", summary: "在保持简单的前提下，逐步拆分索引、解析和通知流程。", date: "07.18", read: "13 MIN", tags: ["架构", "事件驱动"] },
    { title: "缓存一致性的三个现实边界", summary: "讨论失效、并发写入和跨区域复制中无法回避的取舍。", date: "07.05", read: "10 MIN", tags: ["缓存", "一致性"] },
    { title: "为个人服务设计轻量可观测性", summary: "用最少的指标、日志和追踪覆盖真正重要的故障场景。", date: "06.22", read: "7 MIN", tags: ["可观测性", "可靠性"] },
  ],
  toolbox: [
    { title: "把重复发布流程压缩成一个命令", summary: "将检查、构建和发布步骤组合成安全且可回滚的自动化流程。", date: "07.14", read: "7 MIN", tags: ["CLI", "自动化"] },
    { title: "可迁移的本地开发环境", summary: "用声明式配置降低换机、重装与多人协作的环境成本。", date: "07.01", read: "8 MIN", tags: ["环境", "效率"] },
    { title: "CLI 工具的错误消息设计", summary: "让命令失败时直接给出原因、上下文和下一步操作。", date: "06.18", read: "5 MIN", tags: ["CLI", "体验"] },
  ],
  reading: [
    { title: "高质量论文笔记的最小结构", summary: "用问题、方法、证据和局限四个字段保留可复用的信息。", date: "07.26", read: "6 MIN", tags: ["论文", "笔记"] },
    { title: "建立长期可检索的阅读索引", summary: "让书籍、论文与摘录在同一套主题关系中持续生长。", date: "07.10", read: "8 MIN", tags: ["索引", "阅读"] },
    { title: "读完之后，怎样把观点变成行动", summary: "从摘录走向判断、实验和复盘，避免知识只停留在收藏夹。", date: "06.25", read: "7 MIN", tags: ["方法", "复盘"] },
  ],
  devops: [
    { title: "一次零停机数据库迁移的完整检查表", summary: "覆盖双写、回填、校验、切换与回滚的关键步骤。", date: "07.22", read: "12 MIN", tags: ["迁移", "发布"] },
    { title: "用少量指标守住服务健康度", summary: "从用户体验出发选择延迟、错误率、流量与饱和度指标。", date: "07.06", read: "8 MIN", tags: ["监控", "SLO"] },
    { title: "让 CI 失败更容易定位", summary: "通过任务拆分、缓存边界和日志分组缩短反馈路径。", date: "06.19", read: "6 MIN", tags: ["CI", "GitHub Actions"] },
  ],
  life: [
    { title: "把习惯追踪设计成低摩擦系统", summary: "减少记录成本，用环境提示和每周复盘替代意志力消耗。", date: "07.17", read: "6 MIN", tags: ["习惯", "复盘"] },
    { title: "旅行资料的轻量整理方法", summary: "用地点、时间和决策三个维度组织行程与现场笔记。", date: "07.03", read: "5 MIN", tags: ["旅行", "整理"] },
    { title: "个人知识库的一次季度维护", summary: "归档失效内容、合并重复主题，并为下阶段留下清晰入口。", date: "06.16", read: "7 MIN", tags: ["知识库", "维护"] },
  ],
};
