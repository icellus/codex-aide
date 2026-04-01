# codex-starter 运行时工作流验证与代码审查报告

更新时间：2026-04-01（已追加修复跟进）

说明：
- 本报告按子线程完成顺序增量写入，先落盘已完成证据，剩余部分待后续线程返回后补齐。
- 本次范围按用户要求收敛为：
  - 运行时工作流验证
  - 完整代码 review
- 明确不包含：
  - 开发期校验体系评审
  - 安装器/安装流程检验

## 修复跟进

本节记录 2026-04-01 同日后续修复结果。

修复证据边界：
- 本次跟进的主要证据来自代码修复与开发期 contract proof，不是新的两轮独立 runtime 手工线程复跑。
- 已实际通过的回归命令为 `node scripts/validate-codex-starter-dev.mjs full`。
- 当前回归结果：`contract PASS (shape=3, behavior=6)`、`consistency PASS`、`meta PASS`。

后续推进建议按以下 5 个分组理解本报告：
- 分组 A：根路径与仓库根事实
  - 对应原始问题：`RV-1`
  - 关注点：deep `cwd`、canonical absolute `projectDir`、`repo_root` 持久化事实
- 分组 B：task-state 状态机与字段联动
  - 对应原始问题：`CF-1`、`RV-2`、`RV-4`、`RV-6`
  - 关注点：合法状态迁移、`waiting_on`、数组字段保留、`parked` 契约漂移
- 分组 C：输入健壮性与路径字段安全
  - 对应原始问题：`CF-2`、`CF-3`
  - 关注点：`task_id -> progress_path`、strict JSON、运行态绝对路径模型
- 分组 D：交付门禁与治理边界
  - 对应原始问题：`RV-3`、`CF-4`、`RV-7`
  - 关注点：authority 文件提交流、special-flow、policy 字段的真实消费
- 分组 E：long-running 闭环
  - 对应原始问题：`RV-5`
  - 关注点：`history/current/archive` 的脚本级同步与归档保证

本轮已落地的修复范围主要覆盖分组 A、B、C、D：
- 分组 A：`projectDir` 收敛为 canonical absolute root，并增加 `.codex/state/repo-context.json` 的 `repo_root` 写入脚本入口。
- 分组 B：task-state contract 收敛状态迁移与字段联动，补 `waiting_on` 归一、数组字段保留、`resume-task` 状态约束。
- 分组 C：补 strict JSON、路径字段绝对化、`task_id` 到默认 `progress_path` 的安全归一。
- 分组 D：放开 authority 文件的受控提交，special-flow 先判目标再决定是否做 generic operation 校验，并接入 policy frontmatter 的关键字段消费。

当前状态判断：
- 分组 A、B、C 的核心问题已从“已确认缺陷”下降为“已修复并有开发期 proof 的项”。
- 分组 D 已从“主要依赖文档声明”下降为“已有执行层修复与开发期 proof 的项”，但仍建议后续补 submit 全链路回归。
- 分组 E 仍是当前最明显的未闭环项。
- 仍不能把系统直接上升为“高可靠”，因为 long-running `history/current/archive` 闭环仍缺脚本级强保证，且尚未复跑最初的独立 runtime 线程。

## 修复后状态

已修复或显著收敛：
- `RV-1`：深层 `cwd` 下 root 解析与写入位置问题已收敛到 canonical absolute `projectDir` 模型，并新增 `project-context`、`repo-context`、hook root propagation 的 behavior proof。
- `CF-1`：`resume-task` 不再允许注入 `completed` / `idle` 等不合理状态。
- `RV-2`：`waiting_user -> active` 后 `waiting_on` 残留问题已修复。
- `CF-2`：默认 `progress_path` 推导已对 `task_id` 做 slug 化，并统一走绝对路径写入模型。
- `CF-3`：`task-state.mjs` stdin 已切换为 strict JSON，不再 fail-open。
- `RV-3`：`validate-git` 不再阻断 `.codex/**` 与 `AGENTS.md` 的受控提交，只继续拦 broad/opaque staging。
- `RV-4`：`open_questions` 与 `routing_overrides` 已改为按字段显式更新，不再在普通 `set` 中静默清空。
- `CF-4`：special-flow 目标已改为先判 target flow，再决定是否做 generic operation 归一化，不再因无关坏 `operations` 提前拒绝。

部分收敛但仍需后续回归确认：
- `RV-7`：governance policy 的 `auto_fix_levels`、`persist_fields`、`active_statuses` 已接入执行层；`version` 仍仅作元数据使用，当前已在 policy 文本中明确。
- `repo_root` 已有独立写入脚本 `node .codex/scripts/context/repo-context.mjs`，但还没有新的真实客户端事件总线端到端证据。

仍未解决：
- `RV-5`：long-running 的 `history/current/archive` 闭环仍主要依赖流程与文档约束，缺少脚本级强保证。
- `RV-6`：`parked` 状态契约漂移仍存在，模板/展示与状态机尚未统一。

建议保留高优先级跟进项：
- 对 long-running `history/current/archive` 补脚本级闭环与 behavior proof。
- 对 `submit` 全链路补 `validate-git + delivery-policy + submit worker` 联动回归。
- 视需要重跑最初两轮独立 runtime 手工线程，确认修复后的真实运行态行为。

## 当前进度

- 运行时测试线程 A：已完成
- 运行时测试线程 B：已完成
- 完整代码 Review 线程：已完成

## 最终结论

结论等级：
- 运行时工作流具备可用基础，但当前不能判定为“高可靠”。
- 原因不是主链路完全跑不通，而是已经存在多处会破坏状态一致性、恢复可信度和治理闭环的高优先级问题。

综合判断：
- 正向链路层面，`task-state`、`task-reconcile`、`task-progress-sync` 和 `hooks.json` 声明链路已有可运行证据。
- 反向路径层面，治理边界和大部分拒绝/回滚逻辑也能命中。
- 但代码 review 与反向测试已经确认，当前 runtime 仍存在若干“看似成功、实际状态错误或写入错误位置”的缺陷，这类问题会直接削弱跨会话恢复、治理写回和长任务可靠性。

当前最关键的问题：
- 深层 `cwd` 下 `projectDir` 解析可能偏离真实仓库根，导致 runtime state/governance 写到错误目录。
- `resume-task` 与若干状态迁移允许写出自相矛盾的 lifecycle 状态。
- `waiting_user -> active` 后 `waiting_on` 可能残留为 `user`。
- `task_id` 可污染自动推导的 `progress_path`。
- 非法 JSON 输入在 `task-state` 中是 fail-open。
- 文档承诺的 long-running `history/current/archive` 闭环，目前更多是策略和技能约束，缺少脚本层强保证。
- `validate-git` 与 `.codex/**` / `AGENTS.md` 版本化交付承诺存在冲突。

## 阶段性结论

当前已确认：
- `task-state.mjs` 的 `set -> blocked -> waiting_user -> record-interruption -> resume-task -> clear` 主体生命周期链路可在隔离副本中跑通。
- long-running 下 `progress_path` 推导、`task-progress-sync.mjs` 漂移检测、`task-reconcile.mjs` 建议动作，均已有实际命令驱动证据。
- `hooks.json` 声明的 `SessionStart` / `Stop` 命令链，可以通过手动回放的方式与脚本行为对上。

当前已暴露的风险/限制：
- `record-interruption` 只对 `active|handoff|blocked` 生效，`waiting_user` 下不会记录中断。
- `task-progress-sync.mjs` 只负责只读对账，不负责修复或写入 `current.md/history`。
- `task-reconcile.mjs` 的 clean/dirty 分支对运行态文件是否被 Git 忽略较敏感。
- `resume-task` 当前允许注入 `completed` / `idle` 之类不合理状态，可能产生命周期字段不一致。
- `task_id` 当前可直接影响自动推导出的 `progress_path` 字符串，包含 `../` 时会进入 runtime state。
- `task-state.mjs` 对非法 JSON 输入是 fail-open，可能把输入层异常吞掉并返回 `noop` 成功。
- governance ingest 在目标应走 special-flow 时，仍可能因为 candidate 中无关但格式错误的 `operations` 提前被拒。
- 还没有拿到反向/失败路径线程和完整 review 线程的最终结论，因此现在不能把当前结果上升为“整体运行时可靠”。

## 线程 A：运行时测试（正向链路与状态闭环）

测试环境：
- 在 `/tmp/codex-runtime-test-a/runtime-repo` 中基于 `/workspace/agent-skills/codex-starter` 副本执行。
- 未改动仓库本体文件。

已验证场景：
- `task-state.mjs` `set`
- `task-state.mjs` `blocked`
- `task-state.mjs` `waiting_user`
- `task-state.mjs` `record-interruption`
- `task-state.mjs` `resume-task`
- `task-state.mjs` `clear`
- `task-progress-sync.mjs` 缺文件与 drift 检测
- `task-reconcile.mjs` 在 dirty / clean / blocked 条件下的建议动作
- `hooks.json` 中 `SessionStart` / `Stop` 的声明式命令链手动回放

关键结果摘要：
- `status=waiting_user` 时，会自动把 `waiting_on` 归一到 `user`。
- `record-interruption` 在 `waiting_user` 状态下是 no-op。
- `resume-task` 的恢复来源是 `recent_tasks` 中状态为 `paused` 的任务，而不是直接恢复当前 hot task。
- long-running 任务在没有显式 `progress_path` 时，会推导到 `.codex/progress/active/<task-id>/current.md`。
- `task-progress-sync.mjs` 能识别 `task-context.json` 与 `current.md` 之间的 drift，但不会自动修复。
- `task-reconcile.mjs` 会根据工作树 clean/dirty 与 checkpoint 推导 `resume-current-task`、`review-if-completed`、`re-check-blocker` 等建议动作。

已确认的残余风险：
- 当前只验证了“按 hooks.json 声明手动回放”的效果，没有经过真实客户端事件总线端到端触发。
- 未覆盖 `completed/cancelled` 终态与 `.codex/progress/archive/**` 归档动作。
- `keep-waiting-user` 分支当前仅看到低可达性迹象，尚未拿到强运行证据。

关键证据文件：
- `/workspace/agent-skills/codex-starter/.codex/hooks.json`
- `/workspace/agent-skills/codex-starter/.codex/scripts/context/task-state.mjs`
- `/workspace/agent-skills/codex-starter/.codex/scripts/context/task-progress-sync.mjs`
- `/workspace/agent-skills/codex-starter/.codex/scripts/context/task-reconcile.mjs`
- `/workspace/agent-skills/codex-starter/.codex/scripts/shared/task-context.mjs`
- `/workspace/agent-skills/codex-starter/.codex/policies/routing-policy.md`

线程 A 实测产物：
- `/tmp/codex-runtime-test-a/runtime-repo/.codex/state/task-context.json`
- `/tmp/codex-runtime-test-a/runtime-repo/.codex/progress/active/rt-a-followup/current.md`
- `/tmp/codex-runtime-test-a/runtime-repo/.codex/logs/runtime-hooks/2026-03-31.jsonl`
- `/tmp/codex-runtime-test-a/runtime-repo/.codex/logs/codex-hooks/2026-03-31.jsonl`

## 线程 B：运行时测试（反向路径、失败路径、治理交叉）

测试环境：
- 在 `/tmp/codex-runtime-test-b` 中基于 `/workspace/agent-skills/codex-starter` 副本执行。
- 未改动仓库本体文件。

已验证场景：
- governance `writeback.mjs` actor 限制
- runtime `state/logs/progress` 目标拒绝
- `scripts/hooks/product` 与 `hooks.json` 的 `ask-user` 分支
- `validation-profile` special-flow
- `G2`、非 `auto-fix`、无 operations、unsupported target、operation 匹配失败
- rollback 成功与 auto-fix 成功
- `ingest-governance.mjs` 的缺 transcript、无 structured result、unsupported role、非 complete 状态、无 candidates、缺失必填字段、fallback evidence、去重
- `task-state.mjs` 的错误路径、非法 JSON、`task_id` 边界、`resume-task` 状态注入

关键结果摘要：
- `writeback.mjs` 对 actor、runtime state/log/progress、scripts/hooks/product、special-flow 的决策边界基本按声明生效。
- rollback 路径可把目标文件恢复，auto-fix 成功后会移除 active governance item。
- `ingest-governance.mjs` 的跳过、拒绝、去重、fallback evidence 基本能跑出对应分支。
- `task-state.mjs` 的多条错误路径能拦截，但 `resume-task` 与 `task_id` 仍暴露了状态与路径安全问题。

已确认问题：
- `CF-1`：`resume-task` 可注入终态或 `idle`，导致 runtime state 不一致。
- `CF-2`：`task_id` 未安全归一化就参与 `progress_path` 推导，runtime state 内可出现带 `../` 的路径字符串。
- `CF-3`：stdin 非 strict，非法 JSON 会被静默降级成 `{}`，最后返回 `noop` 成功。
- `CF-4`：本应进入 special-flow 的 ingest 候选，仍可能因格式错误的 `operations` 在 writeback 归一化阶段被提前拒绝。

推断风险：
- 若后续真实写入进度文件的模块直接信任 `progress_path`，`CF-2` 可能继续放大为目录越界写入风险。
- `CF-3` 会让输入链路异常更难被观测，形成“看似执行成功，实际没有更新状态”的假象。
- `CF-4` 会让治理事项因为输入噪声漏入 special-flow 之外。

线程 B 产物：
- `/tmp/codex-runtime-test-b/results.json`
- `/tmp/codex-runtime-test-b/summary.txt`
- `/tmp/codex-runtime-test-b/extra-ig07b.json`
- `/tmp/codex-runtime-test-b/extra-ts11.json`

关键证据文件：
- `/workspace/agent-skills/codex-starter/.codex/scripts/governance/writeback.mjs`
- `/workspace/agent-skills/codex-starter/.codex/hooks/ingest-governance.mjs`
- `/workspace/agent-skills/codex-starter/.codex/scripts/context/task-state.mjs`
- `/workspace/agent-skills/codex-starter/.codex/scripts/shared/io.mjs`

## 线程 C：完整代码 Review

review 结论：
- 发现 3 个高优先级问题，4 个中优先级问题。
- 这些问题大多集中在状态机一致性、路径/目录边界、治理执行与策略承诺偏差、以及交付门禁冲突。

高优先级问题：
- `RV-1` 深层 `cwd` 会把 runtime 状态写到错误目录，且 governance 在该条件下可能静默吞掉失败。
- `RV-2` `waiting_user -> active` 状态迁移后，`waiting_on` 不会自动清空。
- `RV-3` `validate-git` 与文档承诺冲突，会阻断 `.codex/**` 与 `AGENTS.md` 的受控提交流。

中优先级问题：
- `RV-4` `open_questions` 与 `routing_overrides` 在普通 `set` 更新中会被静默清空。
- `RV-5` long-running 的进度同步/归档闭环主要是文档承诺，缺少脚本级保证。
- `RV-6` `parked` 状态存在契约漂移：模板/展示支持，但状态机不支持。
- `RV-7` governance policy 的多个字段未被执行层真正消费，行为并非完全 policy-driven。

代码 review 残余风险：
- 当前开发验证不覆盖 `waiting_on` 清理、数组字段保留、`parked` 语义等细粒度迁移问题。
- 缺少“hooks + 深层 cwd”集成测试。
- 缺少“submit + validate-git”联动测试，导致交付边界冲突不易被提前发现。

关键证据文件：
- `/workspace/agent-skills/codex-starter/.codex/scripts/shared/project-context.mjs`
- `/workspace/agent-skills/codex-starter/.codex/hooks.json`
- `/workspace/agent-skills/codex-starter/.codex/hooks/ingest-governance.mjs`
- `/workspace/agent-skills/codex-starter/.codex/scripts/context/task-state.mjs`
- `/workspace/agent-skills/codex-starter/.codex/scripts/guards/validate-git.mjs`
- `/workspace/agent-skills/codex-starter/.codex/templates/progress/current.md`
- `/workspace/agent-skills/codex-starter/.codex/scripts/context/task-overview.mjs`
- `/workspace/agent-skills/codex-starter/.codex/policies/aide-governance-policy.md`

## 综合问题清单

按严重度汇总：
- High: 深层 `cwd` 可能导致 runtime state/governance 写到错误目录，且失败不一定显式暴露。
- High: `resume-task` 可注入 `completed` / `idle`，导致生命周期字段不一致。
- High: `waiting_user -> active` 时 `waiting_on` 可能残留为 `user`。
- High: `validate-git` 与 `.codex/**` / `AGENTS.md` 版本化交付承诺冲突。
- Medium: `task_id` 可污染自动推导的 `progress_path`。
- Medium: `task-state` 对非法 JSON fail-open。
- Medium: `open_questions` 与 `routing_overrides` 会在普通更新中被静默清空。
- Medium: long-running 的 `history/current/archive` 缺少脚本级闭环。
- Medium: `parked` 状态契约漂移。
- Medium: governance policy 与执行层存在未消费字段。

## 结论边界

本报告已覆盖：
- 两个独立线程的运行时工作流测试
- 一个独立线程的完整代码 review
- 正向链路、反向路径、失败路径、治理交叉、状态边界

本报告未覆盖：
- 开发期校验体系评审
- 安装器/安装流程检验
- 真实 Codex 客户端事件总线端到端触发
- 修复后的回归验证
