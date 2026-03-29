# Discussion Current

Updated: 2026-03-30 02:21 Asia/Shanghai
Source: `discussion/history/2026-03-30-0221-refactor-rules-and-review-separation.md`

## 当前状态

本仓库当前只维护 `codex-starter`。

当前主线工作仍是 `codex-starter` 中层重构，但当前阶段已经从“继续讨论规则”切到“先复核两组已完成子线程改动”：

- 关键规则已经确认：
  - `product_manager -> architect -> technical_manager`
  - `Implementation Brief` 取代旧 `plan`
  - `plan-summary` 之后直接删除
  - 缺少 `Implementation Brief` 时，`coder/tester` 直接 `blocked` 回 `technical_manager`
- 当前工作分支：`refactor/codex-starter-middle-layer`
- 当前最新提交：`9d91d8e`

当前仍有一个明确 blocker：

- 已确认规则很多，但工作区里两组实现都还没有经过主线程复核
- 现在不能继续开新的实现线程，必须先复核现有改动

## 下一轮焦点

下一轮只继续一个主题：

- 主线程先复核子线程 1 和子线程 2 的改动，再决定哪些并入主线、哪些继续修改

不要再把“规则已确认”和“代码已完成”混在一起，也不要在复核前继续新增实现线程。

## 当前判断

- discussion 文档已经重写为“已确认规则 / 已提交施工 / 待复核施工 / 未完成施工”分离结构
- 子线程 1 已完成一组 runtime / blocked / handoff / reminder 改动，但未复核
- 子线程 2 已完成 `product_manager` / `architect` / `Implementation Brief` 模板相关改动，但未复核
- `Implementation Brief` 主模板目前只存在于工作区草稿，尚未被主线程确认
- `discussion/codex-starter-refactor/` 已成为这轮重构的 canonical 跟踪目录

## 本轮必读文件

继续这轮重构前，优先读：

1. [CONTEXT.md](/workspace/agent-skills/discussion/codex-starter-refactor/CONTEXT.md)
2. [PLAN.md](/workspace/agent-skills/discussion/codex-starter-refactor/PLAN.md)
3. 当前工作区里两组未复核改动的 diff

## 测试与验证提醒

仓库维护测试统一走：

```bash
node tests/codex-starter/run.mjs
```

如果是明确 write set 的定向验证，优先走：

```bash
node tests/codex-starter/run.mjs --file <path> --file <path>
```

如果改动涉及 runner / manifest / shared helpers / 多层测试结构，直接跑：

```bash
node tests/codex-starter/run.mjs --suite full
```

## 关联历史

- `discussion/history/2026-03-30-0221-refactor-rules-and-review-separation.md`
- `discussion/history/2026-03-30-0044-middle-role-rename-and-plan-sync.md`
- `discussion/history/2026-03-30-0033-codex-starter-middle-layer-refactor.md`
- `discussion/history/2026-03-29-1740-story-term-next-context.md`
- `discussion/history/2026-03-29-1622-discussion-sync-intent.md`
