# codex-starter 重构上下文（稳定版）

本文件只保留稳定背景与已定规则。
动态施工、状态与验证留痕统一看 `discussion/codex-starter-refactor/PLAN.md`。

## 本轮目标与边界

- 稳定中层链路：`product_manager -> architect -> technical_manager -> coder -> tester -> (optional qc)`
- 固化执行输入：`Implementation Brief` 作为执行层单一输入
- 对齐表达口径：authority、skills、templates、runtime 使用同一套语义

## 已确认规则（稳定）

- `Aide` 不直接管理执行角色；执行链由 `technical_manager` 统一编排
- `coder` / `tester` 缺少可读 `Implementation Brief` 时，必须 `blocked` 回 `technical_manager`
- `coder` 完成后必须进入 `tester`；是否进入 `qc` 由 `technical_manager` 判定
- 默认不保留旧命名、旧字段、旧语义兼容层
- 进度记录正式落点：`codex-starter/.codex/progress/`
- 固定结构：`active/<task-id>/current.md` + `history/*.md`；完成后移入 `archive/<task-id>/`
- 进度记录责任人：`technical_manager`
- 不再使用单一 `PROGRESS.md` 作为主记录源

## 当前阶段

- 规则已定稿，主线程处于收口和一致性复核阶段

## 仍待主线程确认

- 在不依赖旧测试脚本前提下，本轮是否补新的自动化验证

## 暂不处理范围

- `Aide` 能力边界细化
- `product_manager` 触发时机细化
- 更完整的路由扩展策略
