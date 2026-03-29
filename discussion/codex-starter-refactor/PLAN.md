# codex-starter 重构计划（双层）

本文件分两层：

- 第一层给用户判断方向、优先级和阶段进度。
- 第二层给执行者追踪施工项、依赖、验证与留痕。

---

## 第一层：用户判断清单

### 1) 目标

- 把中层链路稳定为：`product_manager -> architect -> technical_manager -> coder -> tester -> (optional qc)`
- 把 `Implementation Brief` 固定为执行层唯一输入
- 让 authority、skills、templates、runtime 对同一套规则表达一致

### 2) 当前主要问题

- 规则已定稿，但工程侧仍有过渡残留需要收口
- authority/skills/templates/runtime 还需最后一轮一致性复核
- 进度记录目前只完成了 authority/skill/template 层规则落地，runtime 级强制写尚未接入
- 旧测试脚本已移除；本轮不再补验证，后续单独重建测试体系

### 3) 确认规则（完成判定）

- 规则判定和施工判定分开写，不能混写
- “已完成施工”必须有分支内提交证据，不能以口头描述替代
- `coder` / `tester` 在缺少可读 `Implementation Brief` 时必须稳定 `blocked`
- 交付收口前不新增并行实现线程，先做一致性复核
- 进度记录主源固定为 `codex-starter/.codex/progress/active/<task-id>/current.md` 与同级 `history/*.md`
- 任务完成后，记录目录移入 `codex-starter/.codex/progress/archive/<task-id>/`
- 进度记录由 `technical_manager` 负责维护
- 单一 `PROGRESS.md` 不再作为主记录源

### 3.1) 进度记录执行层级

- 当前已落地的是“规则执行”：
  - authority / skill / template 已要求 `technical_manager` 在关键事件下写 `.codex/progress/**`
  - 这表示“应该写”，但仍依赖执行角色按规则完成
- 当前尚未落地的是“runtime 强制写”：
  - 还没有在 runtime scripts / hooks 中对这些事件做自动落盘
  - 这表示“发生了就写”的机械执行器还不存在
- 因此当前状态是：
  - 规则与模板已定
  - 运行时自动写入尚未实现

### 4) 阶段状态

#### 已确认规则

- 角色职责与链路边界已确认
- `Implementation Brief` 取代旧 `plan` 作为执行输入已确认
- 旧语义默认不做兼容保留已确认
- 进度记录落点、目录结构、责任人已确认
- 单一 `PROGRESS.md` 退场已确认

#### 已完成施工（已提交）

- 中层角色重命名与核心链路语义已提交
- `Implementation Brief` 模板与 `product_manager -> architect -> technical_manager` 交接已提交
- brief 缺失时的 `blocked` 语义已落地到 agents/skills/runtime（提交已存在）
- 本轮跟踪文件 `CONTEXT.md` / `PLAN.md` 已并入分支持续维护

#### 当前工作区收口（未提交）

- `plan_path` 已开始被 `brief_path` 取代，执行 contract 正在切到 `Implementation Brief`
- central authority 已明确：一旦进入 `product_manager` 路径，下一步必须进入 `architect`
- `plan-summary` 模板已删除，相关 progress/template 文案已同步收口
- 旧 `tests/codex-starter` 测试脚本已整体移除，仓库说明已改为“不再依赖旧 runner”
- authority/skills/templates/runtime 正在做全链路一致性复核
- 本次已把进度记录规则同步到 `CONTEXT.md` / `PLAN.md`
- `.codex/progress/` 目录制已落到 authority/skill/template，但 runtime 强制写尚未接入

#### 暂不处理范围

- `Aide` 能力边界细化
- `product_manager` 触发条件细化
- 更完整的路由扩展策略
- 新测试体系重建

---

## 第二层：执行者施工清单

状态值：`已完成（已提交）` / `已完成（当前工作区，未提交）` / `正在收口` / `待主线程确认` / `暂不处理`

| ID | 施工项 | 对应范围 | 依赖 | 状态 | 验证/记录要求 |
|---|---|---|---|---|---|
| E1 | 中层角色重命名与职责收敛 | `codex-starter/AGENTS.md`、`codex-starter/.codex/routing-policy.md`、`codex-starter/.agents/skills/{aide,product_manager,architect,technical_manager}` | 无 | 已完成（已提交） | 以分支提交记录为准；收口时再做一次命名残留扫描（`rg`） |
| E2 | 执行门禁：缺 brief 即 `blocked` | `codex-starter/.codex/agents/{coder,tester,qc_reviewer}.toml`、`codex-starter/.codex/scripts/{runtime-state,runtime-utils,session-context}.mjs`、`codex-starter/.agents/skills/{technical_manager,qc,auto_qc}` | E1 | 已完成（已提交） | 保留“blocked 触发条件+回退路径”证据；收口复核时确认无绕过链路 |
| E3 | `Implementation Brief` 模板与上游交接 | `codex-starter/.codex/templates/{implementation-brief,architecture,prd,validation-handoff}.md`、`codex-starter/.agents/skills/product_manager/SKILL.md`、`codex-starter/.agents/skills/architect/SKILL.md` | E1 | 已完成（已提交） | 模板字段完整性复核；确认 `product_manager -> architect -> technical_manager` 文案一致 |
| E4 | 执行 contract 从 `plan_path` 切到 `brief_path` | `codex-starter/.codex/agents/{coder,tester,qc_reviewer}.toml`、`codex-starter/.codex/scripts/{runtime-state,runtime-utils,session-context}.mjs`、相关 authority/skill 文案 | E2,E3 | 已完成（当前工作区，未提交） | 主线程确认无旧字段残留后才能算真正收口 |
| E5 | 收紧 `product_manager -> architect` authority | `codex-starter/AGENTS.md`、`codex-starter/.codex/routing-policy.md`、`codex-starter/.agents/skills/technical_manager/SKILL.md` | E1,E3 | 已完成（当前工作区，未提交） | 确认 central authority 与 skill 文案不再冲突 |
| E6 | 清理 `plan-summary` 与旧 progress 主记录残留 | `codex-starter/.codex/templates/plan-summary.md`、`codex-starter/.codex/templates/{progress,progress.release}.md`、相关 authority/template 文案 | E2,E3 | 已完成（当前工作区，未提交） | 记录删除结果；确认不再把单一 `PROGRESS.md` 作为主记录口径 |
| E7 | 全链路一致性复核（含进度记录新口径） | authority + skills + templates + runtime 全面比对 | E4,E5,E6 | 正在收口 | 形成差异清单（已一致/待改/待确认）；确认统一指向 `progress/active|history|archive` 结构 |
| E8 | 旧测试脚本退场与验证口径重定 | `tests/codex-starter/**`、根目录说明文档、`discussion/codex-starter-refactor/*` 记录 | E7 | 已完成（当前工作区，未提交） | 删除旧测试脚本；不再依赖旧 runner；明确本轮实际验证方式或未验证记录 |
| E9 | 进度记录规则定稿并同步到重构文档 | `discussion/codex-starter-refactor/{CONTEXT,PLAN}.md` | 无 | 已完成（当前工作区，未提交） | 明确落点、目录结构、责任人与“弃用单一 `PROGRESS.md` 主源” |
| E10 | 进度记录 runtime 强制写接入 | runtime scripts / hooks / task-id 绑定 / archive 时机 | E7,E9 | 暂不处理 | 当前只完成规则执行，尚未实现自动落盘；后续单独设计事件触发、task-id 绑定、归档策略 |

## 本阶段执行顺序

1. E9 已完成，本轮文档口径已与新规则对齐。
2. 继续完成 E4/E5/E6/E8 的主线程复核。
3. 再执行 E7 做一次全链路一致性复核。
4. E10 明确保留为后续独立施工，不在本轮展开。
5. 最后把未提交内容、未验证项和后置事项写清。
