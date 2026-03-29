# codex-starter 重构上下文

本目录是当前这轮 `codex-starter` 重构的单一跟踪入口。

后续继续这轮工作时，先读：

1. `discussion/codex-starter-refactor/CONTEXT.md`
2. `discussion/codex-starter-refactor/PLAN.md`

不要再依赖零散聊天记录回忆上下文。

## 这轮重构要解决什么

当前核心问题不是单个文件过长，而是：

- 规则反复解释
- 中层角色定义重叠
- `Aide` 误入执行链
- 旧 `plan` 角色语义漂移
- 执行输入不唯一
- authority 已变化，但 authority、模板、交接、runtime 还没有完全一致

## 本轮已确认规则

下面这些是本轮对话已经确认的规则。

它们表示“方向和规则已经定了”，不表示“代码已经全部做完”。

### 1. 角色关系

- `Aide` 只负责外层协调、治理、收口
- `Aide` 不直接管理 `coder` / `tester` / `qc` / `submit`
- `product_manager` 直接对接 `Aide`
- `architect` 依赖 `product_manager` 产出的 `PRD`
- `architect` 的结果直接给 `technical_manager`
- 一旦进入 `product_manager` 路径，就自动启用 `architect`
- `technical_manager` 不是单独一条任务线，而是职责范围与权能中心
- `coder` / `tester` / `qc` 都只回复给 `technical_manager`

### 2. 产物边界

- `PRD` 负责 WHAT / WHY / MVP
- 架构方案负责系统级 HOW
- `任务实施说明` 负责执行层单一输入
- 验证交接只负责 `tester -> technical_manager`
- 进度记录只负责 `technical_manager` 做了什么

### 3. `任务实施说明`

- `任务实施说明` 的英文名定为 `Implementation Brief`
- 新的 `Implementation Brief` 取代旧 `plan` 文档
- 不保留旧 `plan` 兼容层
- 旧 `plan` 里真正服务执行的内容保留进 `Implementation Brief`
- 旧 `plan` 里服务流程控制和历史兼容的内容直接删掉
- `plan-summary` 不改名保留，直接删除
- `Implementation Brief` 的“输入来源”是必有栏目
- 但 `PRD` / 架构方案不是必备来源；有则写，没有则不强行补

### 4. 执行规则

- `technical_manager` 拿到上游产物后，必须先产出 `Implementation Brief`，再进入 `coder` / `tester`
- 非编码任务时，`technical_manager` 不产出 `Implementation Brief`
- 但 `technical_manager` 只要做了事，就要留记录
- 编码任务里，产出 `Implementation Brief` 这件事本身也要记
- 这份记录先作为给 `Aide` 看的资料存在
- `Aide` 如何消费这份资料后置讨论
- 编码任务中，`coder` 完成后必须接 `tester`
- `tester` 之后是否进入 `qc`，由 `technical_manager` 决定
- 没有 `Implementation Brief` 时，`coder` / `tester` 不执行，直接 `blocked` 回给 `technical_manager`
- 这类 `blocked` 后，由 `technical_manager` 决定补说明、改线，或回 `Aide` 补用户信息

### 5. 兼容策略

- 旧命名、旧字段、旧语义默认不做兼容保留

## 当前不在本轮展开的议题

- `Aide` 的能力范围细节
- 什么时候启用 `product_manager`
- 更完整的路由策略
- 记录放在哪里、记录格式怎么定

## 当前工作区真实状态

当前分支：`refactor/codex-starter-middle-layer`

当前工作区里有两组未提交、未复核的代码改动。

### 子线程 1 已完成，但未复核

子线程 1 处理的是：

- 缺少 `Implementation Brief` 时的 `blocked` 处理
- `technical_manager` / `coder` / `tester` / `qc` 之间的交接与提醒语义收口

当前工作区里对应改动涉及：

- `codex-starter/AGENTS.md`
- `codex-starter/.codex/routing-policy.md`
- `codex-starter/.codex/scripts/runtime-state.mjs`
- `codex-starter/.codex/scripts/session-context.mjs`
- `codex-starter/.agents/skills/technical_manager/SKILL.md`
- `codex-starter/.codex/agents/coder.toml`
- `codex-starter/.codex/agents/tester.toml`
- `codex-starter/.codex/agents/qc_reviewer.toml`
- `codex-starter/.agents/skills/qc/SKILL.md`
- `codex-starter/.agents/skills/auto_qc/SKILL.md`
- `codex-starter/.codex/templates/prd.md`
- `codex-starter/.codex/templates/plan-summary.md`
- `codex-starter/.codex/templates/progress.md`
- `codex-starter/.codex/templates/progress.release.md`
- `codex-starter/.codex/templates/validation-handoff.md`

子线程 1 自报已跑一组定向 `smoke`，结果通过。

但主线程还没有复核，所以这些改动现在不能算并入主线。

### 子线程 2 已完成，但未复核

子线程 2 处理的是：

- `product_manager -> architect -> technical_manager` 关系文案
- `architecture.md` 模板
- 新建 `Implementation Brief` 主模板

当前工作区里对应改动涉及：

- `codex-starter/.agents/skills/product_manager/SKILL.md`
- `codex-starter/.agents/skills/architect/SKILL.md`
- `codex-starter/.codex/templates/architecture.md`
- `codex-starter/.codex/templates/implementation-brief.md`

子线程 2 未跑测试，只做了本地一致性检查。

同样，主线程还没有复核，所以这些改动现在也不能算并入主线。

## 当前 blocker

当前 blocker 不是“规则没定”，而是：

- 已定规则很多，但还没有被正确分离成“已确认规则”和“已完成施工”
- `Implementation Brief` 主模板虽然已有一版工作区草稿，但还没主线程复核
- `plan-summary` 还没真正删除
- authority / skills / templates / runtime 还没有完全收齐到同一套新规则
- 现在不能继续开新的实现线程，必须先复核已有两组改动

## 当前最重要的一句约束

后续所有改动都应服务于这一条：

**先把已确认规则、已完成施工、待复核施工三者分清，再继续把规则落实到真正一致的 authority、模板、交接和 runtime 行为。**
