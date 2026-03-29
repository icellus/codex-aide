# 概览

这份文档用于解释模型，不是运行时权威。
运行时权威在 `AGENTS.md`、`.agents/skills/*/SKILL.md` 和 `.codex/routing-policy.md`。

英文文档是主版本。
中文文档是同步说明。

## 这套 Starter 是什么

`codex-starter` 是一套项目本地的 Codex 工作流骨架，当前有两条交付线：

- coding：代码变更、验证、审计、受控交付
- product：文档和其他非代码产物

它适合希望保持默认轻量、但在任务需要时仍然能启用更强控制的仓库。

`Aide`、`qc`、`submit` 是逻辑路由别名。
有些 Codex 客户端不支持自定义 slash command，这时应直接用自然语言表达需求，并映射到同一路由。

## 核心原则

- 默认从轻开始
- 用户可见命令面保持小
- 运行时权威明确
- `Aide` 像团队秘书兼人事主管一样工作
- `Aide` 默认只启用完成当前任务所需的最小团队，只有在确有价值时才加人
- 建议型、分析型任务由 `Aide` 对用户收口；如果是 read-heavy 分析，默认先用 `repo_explorer` 做只读检索
- 执行角色负责具体交付
- product 记忆保持轻量且可修正

## 运行时权威

| 文件 | 作用 |
| --- | --- |
| `AGENTS.md` | 全局入口和路由映射 |
| `.agents/skills/*/SKILL.md` | skill 契约 |
| `.codex/agents/*.toml` | 子代理角色定义 |
| `.codex/routing-policy.md` | 路由与模块启用策略 |
| `.codex/delivery-policy.json` | 受控交付默认策略 |
| `.codex/evolution-policy.json` | 自动治理写回策略 |
| `.codex/state/task-context.json` | 热任务状态 |
| `.codex/state/task-registry.json` | 当前与未结束任务历史 |
| `.codex/state/repo-context.json` | 仓库缓存事实 |
| `.codex/validation-profile.json` | 仓库级验证基线 |
| `.codex/state/evolution-registry.json` | 治理进化队列 |
| `.codex/scripts/*.mjs` | 运行时辅助脚本 |
| `.product/registry.json` | product 模板注册表 |
| `.product/memory.json` | product 轻量记忆；与当前对话冲突时以当前对话为准 |
| `.product/evolution.json` | product 进化候选，需结合真实聊天记录审核 |

## 角色与模块

| 项目 | 作用 | 默认状态 |
| --- | --- | --- |
| `Aide` | 首轮接应、分派、治理、结果复审 | 启用 |
| `conduct` | delivery routing、环境判断与 environment setup | 关闭 |
| `prd` | WHAT / WHY / MVP 澄清 | 关闭 |
| `architect` | HOW 层面的系统设计 | 关闭 |
| `plan` | 实施 handoff | 关闭 |
| `product_assistant` | 文档和非代码交付 | 关闭 |
| `tester` | 任务级验证 owner | 关闭 |
| `coder` | 实现与 sanity checks | 关闭 |
| `qc` | 显式审计 gate | 关闭 |
| `submit` | 受控交付 | 关闭 |

这个“默认关闭”的表不是装饰：

- 新仓库或上下文不足，本身不应该让全队一起醒来
- 如果任务已经很具体，`Aide` 应先激活一个明确的执行角色
- 新 task chain 启动时，能分派就优先用真实子代理，减少主线程上下文污染
- 当任务收窄或风险解除后，额外角色应及时退出

## 两条交付线

在正式交付线之外，还有一类默认留在 `Aide` 内部处理的建议型、分析型任务：

- 问答
- 分析
- 方案比较
- 路线建议

这类任务没有持久产物要求时，不默认下派执行角色，也不默认落持久状态。
如果分析任务本身 read-heavy，优先让 `repo_explorer` 做只读扫描，再由 `Aide` 对用户汇总收口。

### Coding 线

当主要交付物是下面这些内容时，用 coding 线：

- 代码改动
- 行为改动
- 任务级验证
- release 或受控交付

典型路径：

```text
Aide -> optional conduct -> optional plan -> tester -> coder -> tester -> optional qc -> optional submit
```

只要 `coder` 参与，进入 settle/submit 前就必须有下游 `tester` handoff。`qc` 仅按风险启用，不能替代 `tester`。

### Product 线

当主要交付物是下面这些内容时，用 product 线：

- 文档
- API 描述
- 结构化非代码内容
- 打包交付物
- 其他非代码输出

典型路径：

```text
Aide -> product_assistant
```

`product_assistant` 可以在需要时读取代码、配置、接口定义等技术材料，但输出仍然要匹配目标受众，避免 AI 腔和不必要的实现噪音。

## `/Aide` 真正优化什么

- 像团队秘书一样接住用户，像人事主管一样安排最合适的人
- 为当前任务选择最轻且合理的下一位负责人
- 对没有持久产物要求的任务直接给出结论和建议
- 以“代办/协调/收口”为主，不把 `/Aide` 当成主力深度排查角色
- 做系统治理，而不是只修一次性产物
- 对 product 线结果做基于真实聊天记录的复审
- 在 product 任务完成边界不稳时，做轻量用户反馈确认
- 在不阻塞首条路由的前提下做低成本进化检查

对明确要落地实现的任务，`/Aide` 应尽快分派，不要为了显得懂而先深读一轮代码；只有在判断 owner 或回答用户问题真的需要时，才做更深的阅读。
对 read-heavy 分析任务，默认用短生命周期的 `repo_explorer` 做阅读，再由 `Aide` 统一对用户回复。
上下文缺失或过期时，也应先做足以安全分派的最小 owner scan，而不是自动 full scan 或默认把整支团队都拉起来。

对 product 任务，`/Aide` 重点要看：

- 用户真正要的交付物是不是已经拿到了
- `.product/*` 写回有没有被真实对话支撑
- 问题到底是用户信息不够、理解偏差，还是本来就该走 coding 线

## Product 工作区

`.product/` 是非代码交付工作区。

- `.product/templates/`：可复用模板
- `.product/registry.json`：模板索引与触发条件
- `.product/memory.json`：轻量用户和仓库偏好记忆
- `.product/evolution.json`：重复错配候选，供后续角色进化参考

当前对话优先于旧记忆。product 记忆应该保持弱、轻、可修正。

## 三种交付形态

- `lightweight`：小范围、局部、清晰任务
- `standard`：受益于计划产物的任务
- `long-running`：跨 session、多 checkpoint、发布或更高风险任务

环境判断与 `environment setup` 属于 `conduct`，不属于 `/Aide`。
