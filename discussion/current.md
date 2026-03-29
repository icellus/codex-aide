# Discussion Current

Updated: 2026-03-30 03:19 Asia/Shanghai
Source: `discussion/history/2026-03-30-0319-progress-dir-rule-vs-runtime-and-test-retire.md`

## 当前状态

本仓库当前只维护 `codex-starter`。

当前主线工作仍是 `codex-starter` 中层重构，但本轮已经从“继续定规则”推进到“按已定规则收口 authority / skill / template / runtime 口径”：

- 已确认：
  - `product_manager -> architect -> technical_manager`
  - `Implementation Brief` 取代旧 `plan`
  - `plan-summary` 直接删除
  - 缺少 `Implementation Brief` 时，`coder/tester` 直接 `blocked` 回 `technical_manager`
  - 进度记录正式落到 `codex-starter/.codex/progress/`
- 当前工作分支：`refactor/codex-starter-middle-layer`
- 当前工作区仍有一批未提交收口改动

## 当前判断

- `discussion/codex-starter-refactor/CONTEXT.md` 和 `PLAN.md` 已成为这轮重构的唯一计划入口。
- `.codex/progress/` 目录制已经定案：
  - `active/<task-id>/current.md`
  - `active/<task-id>/history/*.md`
  - `archive/<task-id>/...`
- 当前已完成的是“规则执行”层：
  authority / skill / template 已要求 `technical_manager` 维护 `.codex/progress/**`
- 当前尚未完成的是“runtime 强制写”层：
  runtime scripts / hooks 还没有自动落盘机制
- 旧 `tests/codex-starter` 测试脚本已退场
- 本轮不再补新的自动化验证；测试体系后续单独重建

## 下一轮焦点

下一轮优先继续：

1. 主线程做一次全链路一致性复核，确认当前工作区所有口径收齐。
2. 若继续推进，再单独设计 runtime 强制写 `.codex/progress/**` 的接入方案。
3. 测试体系重建单独立项，不混入当前收口。

## 本轮必读文件

1. [CONTEXT.md](/workspace/agent-skills/discussion/codex-starter-refactor/CONTEXT.md)
2. [PLAN.md](/workspace/agent-skills/discussion/codex-starter-refactor/PLAN.md)
3. 当前工作区未提交 diff

## 关联历史

- `discussion/history/2026-03-30-0319-progress-dir-rule-vs-runtime-and-test-retire.md`
- `discussion/history/2026-03-30-0221-refactor-rules-and-review-separation.md`
- `discussion/history/2026-03-30-0044-middle-role-rename-and-plan-sync.md`
- `discussion/history/2026-03-30-0033-codex-starter-middle-layer-refactor.md`
