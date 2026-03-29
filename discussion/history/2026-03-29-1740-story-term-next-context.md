# Discussion History

Updated: 2026-03-29 17:40 Asia/Shanghai
Topic: `story` 词的历史性与后续讨论准备

## 本轮完成

- 明确并收紧了宿主与 `codex-starter` 的边界：
  宿主维护规则与 `codex-starter` runtime authority 已分层，避免把 starter 反向当成当前维护会话 authority。
- 修复了 `codex-starter` 当前工作流线上的关键问题：
  - `task.workflow` 新增并稳定使用 `phase + chain_id`
  - `tester` handoff 契约新增 `workflow_chain_id`
  - 受保护链路下，`tester` 的 `workflow_chain_id` 匹配才允许清 guard
  - `workflow_chain_id` 缺失或不匹配都会阻断 handoff
  - `session_end` 已收紧为 best-effort cleanup，不再推进 QC / submit / settle
- 针对上述改动，完整验证已通过：
  `node tests/codex-starter/run.mjs --suite full`
- 实现后 review 已完成，结论为 `No blocking findings`。

## 本轮结论

- 这次会话里已经落地的修复问题可视为闭环完成，当前没有需要在推送前继续处理的 blocker。
- 接下来的讨论焦点不再是宿主层，也不再是 handoff 基础闭环，而是 `codex-starter` 中 `story` 这个词本身。

## 对 `story` 的当前判断

- `story` 大概率是历史词，不是好的当前命名。
- 但它不是死词，仍然承担真实 runtime 语义：
  - `PROGRESS.md`
  - `plans/*.md`
  - `story_path / storyPath`
  - task registry 中的 `story:<path>` 匹配键
- 因此不能把它当纯文案残留直接删掉；如果要改，必须当成数据模型和兼容迁移问题来处理。

## 下次应直接讨论的问题

1. `story` 现在到底表示什么：
   是“progress-tracked work item”，还是更窄的旧 planning 单元。
2. 是保留这个词并重新定义，还是迁移到更中性的词（例如 `work_item` / `tracked_item`）。
3. 如果迁移，兼容边界怎么定：
   - `PROGRESS.md`
   - runtime 输入字段
   - task registry match key
   - retrospective / pending actions

## 下次建议切入顺序

1. 先逐点确认 `story` 在 runtime/state/registry 中的实际职责
2. 再决定它是不是只需要重新命名，还是需要数据迁移
3. 最后才动字段名、文档词汇和兼容策略

