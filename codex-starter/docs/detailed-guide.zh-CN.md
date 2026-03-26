# 详细说明：功能、设计、流程、使用

这份文档面向两类人：

- 想真正理解 `codex-starter` 目前如何工作的使用者
- 需要基于当前实现继续调整、校正和演进这套 starter 的维护者

如果你对当前代码不熟，这份文档应作为后续改动前的第一份参考。

## 1. 先建立正确心智模型

可以把 `codex-starter` 理解成四层：

1. `AGENTS.md`
2. `.agents/skills/*`
3. `.codex/*`
4. 真实项目代码与测试

它们分别回答不同问题：

- `AGENTS.md`：从哪里进入，命令怎么分发，全局最小规则是什么
- `.agents/skills/*`：不同命令或内部模块在做什么
- `.codex/*`：运行时如何路由、如何记状态、如何定义子代理、如何做辅助自动化
- 项目代码与测试：真正的实现上下文和验证依据

这套 starter 的核心哲学不是“流程越完整越好”，而是：

- 默认轻量
- 按需升级
- 上下文只带当前真正需要的部分

## 2. 当前设计目标

当前实现主要在优化这几件事：

- 小任务不要被重流程拖慢
- 大任务需要时可以升级到 plan / QC / follow
- 主会话尽量只做 intake、routing、governance、integration
- 执行工作尽量交给子代理
- 热状态 JSON 化，减少跨回合和跨 session 的上下文成本

换句话说，它是一个“默认 direct，必要时升级”的 starter，而不是一个“默认 orchestrated”的 starter。

## 3. 目录结构与职责

### 根目录

#### `AGENTS.md`

角色：

- 用户输入的全局入口
- slash command 到 skill 的映射
- 运行时权威文件总览
- 少量 guardrails

设计要求：

- 保持短
- 只保留全局信息
- 不重新堆积所有具体流程细节

如果以后你发现 `AGENTS.md` 越写越长，通常说明规则放错层了。

### `.agents/`

#### `.agents/skills/*/SKILL.md`

角色：

- 定义 repo-local skills
- 描述命令协议和角色边界

它更偏“人类可维护的行为说明”，不应该承担机器状态。

### `.codex/`

`.codex/` 是运行时层。里面包含：

#### `.codex/agents/*.toml`

角色：

- 定义子代理
- 指定模型、权限、基础 developer instructions

当前主要子代理包括：

- `coder`
- `tester`
- `qc_reviewer`
- `follow_worker`
- `repo_explorer`

#### `.codex/state/*.json`

角色：

- 保存热状态和 runtime memory

当前主要状态文件包括：

- `task-context.json`
- `repo-context.json`
- `runtime-state.json`

#### `.codex/scripts/*.mjs`

角色：

- 提供可选运行时辅助能力

当前主要脚本包括：

- `session-context.mjs`
- `runtime-state.mjs`
- `validate-git.mjs`

#### 其他关键文件

- `.codex/routing-policy.md`
- `.codex/validation-profile.json`
- `.codex/project-profile.md`
- `.codex/templates/*`

## 4. 最重要的几个文件分别怎么理解

### 4.1 `AGENTS.md`

这个文件负责“入口和总览”，不负责细节实现。

它当前主要回答：

- `/Aide`、`/qc`、`/follow` 分别应该加载哪个 skill
- 不带 slash command 时，应该优先看哪些热状态文件
- 哪些文件属于 runtime files
- 哪些 guardrails 是全局的

如果你要改：

- command 映射
- 全局入口约定
- 最少量的跨模块规则

应该优先考虑这里。

但如果你要改的是：

- 具体路由条件
- QC 策略
- 子代理行为

通常不应先改这里。

### 4.2 `.codex/routing-policy.md`

这是“路由和模块启用策略”的权威文件。

它定义：

- 任务类别默认模式
- 什么时候从 direct 升级
- 什么时候启用 `prd` / `architect` / `plan` / `tester` / `coder` / `/qc` / `/follow`
- `workspace prep` 的默认选择

如果你觉得：

- 某类任务总是被路由错
- 模块启用太重
- 模块启用太轻
- `workspace prep` 决策不对

应该优先改这里。

### 4.3 `.codex/state/task-context.json`

这是当前实现里最重要的热状态文件之一。

它保存：

- 当前任务
- 任务状态
- 任务类别
- 风险等级
- 当前 delivery mode
- route rationale
- 已启用角色与模块
- QC / follow 策略
- 协作偏好

运行时优先读取它，而不是 Markdown 摘要。

如果你后续要优化上下文成本，这个文件是第一重点。

原则：

- 保持短
- 保持结构化
- 只放当前热信息
- 不要往里塞历史长文本

### 4.4 `.codex/state/repo-context.json`

这是仓库级缓存事实。

它保存：

- 语言和框架
- 仓库形态
- CI / 部署信号
- release 路径
- validation 信号

它存在的主要目的是：

- 避免每次 `/Aide` 都做全仓重扫
- 让后续子代理启动时可以少读很多基础仓库信息

### 4.5 `.codex/validation-profile.json`

这是“验证命令权威”。

它不是描述流程，而是描述：

- 当前仓库的验证命令
- 哪些命令适合快速反馈
- 哪些命令是 focused validation
- 哪些命令昂贵
- 哪些命令依赖服务

如果你觉得：

- 子代理总是跑错命令
- `/qc` 总是选错验证深度
- 验证开销太大

优先看这里，而不是去改 skills 文案。

### 4.6 `.codex/project-profile.md`

这是人类可读的短摘要。

当前版本里，它不再是运行时热状态主文件。  
它的作用更接近：

- 给人快速浏览项目当前概况
- 在不看 JSON 的情况下做一次人工理解

如果以后你又把大量热状态逻辑写回这个文件，会重新增加运行时上下文负担。

### 4.7 `PROGRESS.md`

它只应在 `orchestrated` 模式下出现。

现在它应该只记录：

- 当前 checkpoint
- next step
- blockers
- 恢复时真正需要的信息

当前实现已经刻意不再把 retrospective / learning queue 当成 `PROGRESS.md` 的主职责。  
原因是它们会让恢复上下文越来越重。

## 5. 当前有哪些用户命令

### `/Aide`

作用：

- 入口
- 扫描
- 更新状态
- 选择路由
- 做治理动作

适合：

- 新任务
- 续接旧任务
- 想刷新仓库认知
- 想做 audit / dedup / prune / writeback

### `/qc`

作用：

- 审计 tester / coder 产出
- 以尽量轻但足够可靠的方式检查正确性和回归风险

适合：

- 高风险任务
- 需要额外质量 gate
- 想核对 handoff 是否可信

### `/follow`

作用：

- 处理推送后、CI、release follow-through

适合：

- 已经推送代码
- CI 或 workflow 已经相关
- release 跟进已经相关

## 6. 当前有哪些内部模块

### `conduct`

负责：

- delivery routing
- `workspace prep`
- 决定是否需要 orchestration

### `prd`

负责：

- WHAT / WHY / MVP 边界

### `architect`

负责：

- HOW 层面的系统设计

### `plan`

负责：

- 实施计划与 handoff 文档

### `tester`

负责：

- 测试设计
- 验证优先工作

### `coder`

负责：

- 实现变更
- focused validation

### `qc_reviewer`

负责：

- 只读质量审计

### `follow_worker`

负责：

- 推送后或 release 后的报告优先跟进

## 7. 当前的三个主要工作模式

### 7.1 `direct`

适用：

- 小范围、局部、低风险、清晰任务

典型过程：

1. `/Aide` 识别任务是 `direct`
2. 必要时拉起 `coder`
3. 运行 focused validation
4. 完成

### 7.2 `plan-driven`

适用：

- 任务不一定大，但需要一个明确实施计划

典型过程：

1. `/Aide` 判断直接开干风险不够低
2. `conduct` 决定启用 `plan`
3. 生成一个 implementation plan
4. 再进入 `tester` / `coder`

### 7.3 `orchestrated`

适用：

- 跨 session
- 多 checkpoint
- release
- 高风险任务

典型过程：

1. `/Aide` 或 `conduct` 判断需要 orchestration
2. 创建或更新 `PROGRESS.md`
3. 分 checkpoint 推进
4. 必要时追加 `/qc` 或 `/follow`

## 8. 当前的核心运行时脚本怎么工作

### 8.1 `session-context.mjs`

作用：

- 在会话开始或恢复时输出简短提醒

它会读取：

- `task-context`
- `runtime-state`
- `PROGRESS.md`

它关注的主要是：

- 是否有 blocked handoff
- 是否有 pending QC
- 当前 active story / plan 是什么
- 是否有 retrospective 或 lesson 相关待处理项

当前设计里，它只会输出少量高优先级提醒，而不是整段状态回放。  
这是为了减少恢复 token 成本。

### 8.2 `runtime-state.mjs`

作用：

- 接收 structured hook event
- 更新 `.codex/state/runtime-state.json`

它主要处理两类事件：

- `subagent_result`
- `session_end`

它当前会做的事情包括：

- 记录最近子代理事件
- 当 `tester` / `coder` 完成且当前任务启用了 QC 时，排队 QC 提醒
- 当 handoff blocked 时记录阻塞提醒
- 记录 QC pass / fail 指标
- 识别 repeated failure pattern
- 裁剪 runtime state，防止无限膨胀
- 在有 `PROGRESS.md` 时只同步必要的 retry pattern

### 8.3 `validate-git.mjs`

作用：

- 防止宽泛 staging

它会拒绝类似：

- `git add .`
- `git add -A`
- `git add --all`

这属于安全 guard，而不是流程路由。

## 9. 为什么现在强调“热状态 JSON 化”

这是当前 starter 最关键的实现方向之一。

原因有三点：

### 9.1 降低运行时读取成本

JSON 更适合脚本和子代理直接读取，不需要每次解析 Markdown 结构。

### 9.2 降低上下文膨胀风险

如果把热状态写在大段 Markdown 里，很容易不断追加解释文字，导致：

- 恢复成本变高
- 提示词越来越重
- 状态和文档边界模糊

### 9.3 让“人类摘要”和“机器状态”分离

人读摘要看 `.codex/project-profile.md`。  
脚本和代理读 `.codex/state/*.json`。

这样长期会更稳定。

## 10. 当前典型流程应该怎么理解

### 10.1 首次接入

1. 复制 `AGENTS.md`、`.agents/skills/`、`.codex/`
2. 运行 `/Aide`
3. `/Aide` 扫描仓库
4. 生成项目专用的 `task-context`、`repo-context`、`validation-profile`
5. 后续任务尽量复用这些状态

### 10.2 小 bugfix

1. `/Aide 修复某个 bug`
2. 判断为 `direct`
3. 直接分配 `coder`
4. 跑 focused validation
5. 完成

### 10.3 高风险 bugfix

1. `/Aide`
2. 判断需要更强验证
3. 先 `tester`
4. 再 `coder`
5. 如果任务启用了 `/qc`，则追加 QC

### 10.4 feature

1. `/Aide`
2. 如果需求边界不稳，走 `prd`
3. 如果系统边界不稳，走 `architect`
4. 如果实施路径需要 durable artifact，走 `plan`
5. 再进入 `tester` / `coder`

### 10.5 release

1. `/Aide`
2. `conduct` 判断为 `orchestrated`
3. 使用 `PROGRESS.md`
4. 必要时加 `/qc`
5. 推送后或发布后再考虑 `/follow`

## 11. 如果你后面要做调整，应该优先改哪里

这是最重要的“校正地图”。

### 想改命令入口或全局最小规则

改：

- `AGENTS.md`

不要先改：

- `project-profile.md`

### 想改任务如何路由

改：

- `.codex/routing-policy.md`

例如：

- 哪类 feature 默认 direct 还是 plan-driven
- 什么情况下启用 `/qc`
- 什么时候启用 `workspace prep`

### 想改验证命令或验证成本

改：

- `.codex/validation-profile.json`

例如：

- fast feedback 用什么命令
- 哪个命令属于 broader validation
- 哪些命令昂贵

### 想改 `/Aide`、`/qc`、`/follow` 的行为协议

改：

- `.agents/skills/*/SKILL.md`

例如：

- `/Aide` 扫描策略
- `/qc` 报告格式
- `/follow` 的 report-only / auto-fix 逻辑

### 想改子代理默认行为

改：

- `.codex/agents/*.toml`

例如：

- 模型
- 权限
- 子代理的最小基础指令

### 想改运行时提醒、状态压缩或 hook 逻辑

改：

- `.codex/scripts/*.mjs`

例如：

- reminder 文本
- runtime-state 裁剪策略
- QC 触发逻辑
- git guard

### 想改人类可读文档

改：

- `README.md`
- `docs/*.md`
- `.codex/project-profile.md` 模板或内容

## 12. 后续改动时建议遵循的顺序

如果你准备调整这套 starter，建议按下面顺序做：

1. 先确定你要改的是“规则”还是“状态”
2. 找到最小权威文件
3. 优先修改最小权威文件，不要多处重复
4. 如果改动影响运行时，检查 `.codex/scripts/*.mjs`
5. 如果改动影响说明文档，同步更新 `README` 和 `docs/`
6. 跑 smoke test

推荐命令：

```bash
node tests/runtime-hooks.smoke.mjs
```

## 13. 当前实现里最容易踩的坑

### 把 `AGENTS.md` 再次写胖

后果：

- 热路径 token 重新变大
- 规则分层失效

### 把机器状态重新写回 `project-profile.md`

后果：

- JSON 热状态失去意义
- Markdown 解析重新变成热路径

### 把 `PROGRESS.md` 重新当运行时数据库

后果：

- 恢复成本不断上涨
- orchestration 文件越来越难读

### 在多个地方重复写同一条规则

后果：

- 后续校正困难
- audit 成本升高

### 用 skills 修验证命令问题

后果：

- 规则和仓库事实混淆

验证命令问题优先应该改 `.codex/validation-profile.json`。

## 14. 建议你的阅读顺序

如果你要靠文档理解当前 starter，我建议按这个顺序看：

1. `README.md`
2. `docs/zh-CN.md`
3. `docs/overview.zh-CN.md`
4. `docs/usage.zh-CN.md`
5. 本文档
6. `AGENTS.md`
7. `.codex/routing-policy.md`
8. `.codex/validation-profile.json`
9. `.codex/state/task-context.json`
10. `.codex/scripts/session-context.mjs`
11. `.codex/scripts/runtime-state.mjs`

## 15. 一句话总结

当前 `codex-starter` 的本质是：

“一套默认 direct、按需升级、把技能层和运行时层分开，并尽量压缩热上下文成本的项目本地 Codex 工作流骨架。”
