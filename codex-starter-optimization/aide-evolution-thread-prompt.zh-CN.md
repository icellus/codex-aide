# 新线程启动提示

下面这段内容可以直接贴到新线程里使用。

## 推荐版

```text
请基于 `codex-starter` 当前实现，专门分析 `/Aide` 的能力进化，以及“角色自动调整进化”是否应该支持、应该支持到什么程度。

先阅读这些文件：
- codex-starter-optimization/aide-evolution-context.zh-CN.md
- codex-starter/README.md
- codex-starter/docs/overview.md
- codex-starter/docs/usage.md
- codex-starter/.agents/skills/aide/SKILL.md
- codex-starter/.agents/skills/architect/SKILL.md
- codex-starter/.codex/routing-policy.md
- codex-starter/.codex/validation-profile.json
- codex-starter/.codex/scripts/aide-governance.mjs
- codex-starter/.codex/scripts/runtime-state.mjs
- codex-starter/.codex/scripts/runtime-utils.mjs
- codex-starter/.codex/scripts/session-context.mjs

讨论目标：
1. 总结当前 `/Aide` 已经具备的治理能力
2. 判断当前实现距离“支持进化”还缺什么
3. 分析 `/Aide` 是否应该支持角色能力的自动调整与进化
4. 明确哪些信号可以作为进化证据
5. 明确自动触发、自动建议、自动应用之间的边界
6. 判断是否需要单独的进化候选注册表或其他冷状态文件
7. 重点分析 token 成本、热路径上下文成本、系统膨胀风险，不要只谈功能完整性

约束条件：
- `/Aide` 优化的是团队系统，不是只修当前任务的表面产物
- 自动触发不等于自动改文件
- 不要把 starter 变成会无限自改的黑箱系统
- 保持现有职责边界：/Aide 负责治理与 writeback 入口，architect 负责 session-end 结构化回顾，tester 负责任务级验证，coder 负责实现，/qc 负责审计
- `architect` 的结构化回顾是常规知识捕获，不是失败后才触发
- 默认不要增加热路径上下文

请按这个结构输出：
1. 当前能力基线
2. 主要缺口和风险
3. 推荐的进化模型
4. 推荐的证据模型
5. 推荐的角色自动调整模型
6. 推荐的状态文件拆分
7. 自动化阈值建议
8. 最小迁移方案
9. 暂时不要自动化的部分

先做分析和方案设计，不要直接改代码。
```

## 精简版

```text
请分析 `codex-starter` 当前 `/Aide` 的治理能力，并重点回答：
- 它离“支持进化”还缺什么
- 是否应该支持角色自动调整进化
- 哪些信号足以触发这种进化
- 自动触发、自动建议、自动应用应该怎么分层
- 怎样尽量不增加 token 和运行时上下文成本

先阅读：
- codex-starter-optimization/aide-evolution-context.zh-CN.md
- codex-starter/.agents/skills/aide/SKILL.md
- codex-starter/.agents/skills/architect/SKILL.md
- codex-starter/.codex/scripts/aide-governance.mjs
- codex-starter/.codex/scripts/runtime-state.mjs
- codex-starter/.codex/scripts/session-context.mjs

请输出：当前基线、问题清单、推荐模型、状态文件建议、迁移建议。
```

## 使用说明

- 如果你希望新线程先把背景吃透，再给完整方案，优先用“推荐版”
- 如果你希望新线程更聚焦，优先用“精简版”
- 这两个提示都默认新线程先分析，不直接实现
