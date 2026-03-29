# codex-starter 重构计划清单

本文件只做一件事：

- 把“规则已确认”
- “代码已完成”
- “工作区待复核”
- “未完成施工”

严格分开记录。

不要再把“讨论定了”写成“代码做完了”。

## 已确认规则

下面这些是已经讨论确认、后续按此实现的规则。

### 角色关系

- [x] `Aide` 只负责外层协调、治理、收口
- [x] `Aide` 不直接管理 `coder` / `tester` / `qc` / `submit`
- [x] `product_manager` 直接对接 `Aide`
- [x] `architect` 依赖 `product_manager` 产出的 `PRD`
- [x] `architect` 的结果直接给 `technical_manager`
- [x] 一旦进入 `product_manager` 路径，就自动启用 `architect`
- [x] `technical_manager` 是职责范围与权能中心，不是单独一条任务线
- [x] `coder` / `tester` / `qc` 都只回复给 `technical_manager`

### 产物边界

- [x] `PRD` 负责 WHAT / WHY / MVP
- [x] 架构方案负责系统级 HOW
- [x] `任务实施说明` 负责执行层单一输入
- [x] 验证交接只负责 `tester -> technical_manager`
- [x] 进度记录只负责 `technical_manager` 做了什么

### `任务实施说明`

- [x] `任务实施说明` 英文名定为 `Implementation Brief`
- [x] `Implementation Brief` 取代旧 `plan` 文档
- [x] 不保留旧 `plan` 兼容层
- [x] 旧 `plan` 中服务执行的内容保留进 `Implementation Brief`
- [x] 旧 `plan` 中流程控制和历史兼容内容直接删除
- [x] `plan-summary` 不改名保留，直接删除
- [x] `Implementation Brief` 要补入：输入来源、`out of scope`、验收/验证目标、交接说明
- [x] `Implementation Brief` 的“输入来源”是必有栏目，但 `PRD` / 架构方案不是必备来源

### 执行规则

- [x] `technical_manager` 先产出 `Implementation Brief`，再进入 `coder` / `tester`
- [x] 非编码任务不产出 `Implementation Brief`
- [x] `technical_manager` 只要做了事，就要留记录
- [x] 产出 `Implementation Brief` 这件事本身也要记
- [x] 这份记录先作为给 `Aide` 看的资料存在
- [x] 编码任务中，`coder` 完成后必须接 `tester`
- [x] `tester` 之后是否进入 `qc`，由 `technical_manager` 决定
- [x] 没有 `Implementation Brief` 时，`coder` / `tester` 不执行，直接 `blocked` 回给 `technical_manager`
- [x] 这类 `blocked` 后，由 `technical_manager` 决定补说明、改线，或回 `Aide` 补用户信息

### 兼容策略

- [x] 旧命名、旧字段、旧语义不做兼容保留

## 已完成施工（已提交）

下面这些才算已经做完并至少提交到当前分支的内容：

- [x] 第一阶段 authority / 中层语义收敛已经在当前分支上
- [x] 中层角色命名已经切到 `product_manager / architect / technical_manager`
- [x] `discussion/codex-starter-refactor/CONTEXT.md` 已提交同步到当前分支
- [x] `discussion/codex-starter-refactor/PLAN.md` 已提交同步到当前分支

## 工作区待复核施工（已做但未并入主线）

### 子线程 1

状态：已完成，未复核

它做了：

- 缺少 `Implementation Brief` 时的 `blocked` 规则收口
- `technical_manager` / `coder` / `tester` / `qc` 之间的交接与提醒语义收口

涉及文件：

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

验证：

- 子线程自报已跑一组定向 `smoke`
- 结果：通过

### 子线程 2

状态：已完成，未复核

它做了：

- `product_manager -> architect -> technical_manager` 关系文案调整
- `architecture.md` 模板调整
- 新建 `Implementation Brief` 主模板

涉及文件：

- `codex-starter/.agents/skills/product_manager/SKILL.md`
- `codex-starter/.agents/skills/architect/SKILL.md`
- `codex-starter/.codex/templates/architecture.md`
- `codex-starter/.codex/templates/implementation-brief.md`

验证：

- 未跑测试
- 仅做本地一致性检查

## 未完成施工清单

下面这些才是接下来真正要做的施工项。

- [ ] 主线程复核子线程 1 改动，决定哪些并入主线、哪些继续修改
- [ ] 主线程复核子线程 2 改动，决定哪些并入主线、哪些继续修改
- [ ] 补齐最终版 `Implementation Brief` 主模板，并与现有产物边界对齐
- [ ] 真正删除 `plan-summary` 及其残留引用
- [ ] 让 authority、skills、templates、runtime 都体现同一套新权能关系
- [ ] 把 `coder -> tester -> 可选 qc` 的运行期交接、提醒、收口语义完全收齐
- [ ] 按“不兼容旧语义”策略清理旧命名、旧字段、旧文案残留
- [ ] 做统一 review
- [ ] 做统一验证
- [ ] 最终收口

## 串行子线程安排

当前规则：

- [x] 现有两个子线程都已完成
- [x] 现阶段不再开新子线程
- [x] 必须先由主线程复核这两组改动
- [ ] 只有复核完并确定主线方向后，才允许再开下一个子线程

后续串行顺序：

1. 主线程复核子线程 1
2. 主线程复核子线程 2
3. 如仍需拆分实施，再开新的单一目标子线程
4. 最后统一 review / 验证 / 收口

## 后置独立议题

- [ ] `Aide` 的能力范围放到后面单独讨论
- [ ] 什么时候启用 `product_manager`，归到路由策略，当前不展开
- [ ] 记录放在哪里、格式怎么定，当前不展开

## 当前最优先

- 先复核子线程 1 和子线程 2 的结果
- 不继续新增实现线程
- 不再把“规则已定”写成“代码已完成”
