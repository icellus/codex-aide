# Discussion Current

Updated: 2026-03-30 00:44 Asia/Shanghai
Source: `discussion/history/2026-03-30-0044-middle-role-rename-and-plan-sync.md`

## 当前状态

本仓库当前只维护 `codex-starter`。

当前主线工作已经从“`story` 一词历史性”切到 `codex-starter` 中层重构：

- 中层 authority / skill / template 收敛已完成第一阶段
- 中层角色已真正改名为 `product_manager / architect / technical_manager`
- 当前工作分支：`refactor/codex-starter-middle-layer`
- 当前最新提交：`15463ba`

当前仍有一个明确 blocker：

- `任务实施说明` 已被 authority 定义为 `coder/tester` 唯一执行输入
- 但 runtime 还没有完全强制这条约束

## 下一轮焦点

只继续一个主题：

- 把 `任务实施说明` 从 authority / 协议层，继续落到 runtime 约束层

不要重新发散去讨论整套模型，也不要重新打开更大的重命名/兼容话题。

## 当前判断

- 第一阶段 authority 收敛已经足够，不应回退
- 执行协议收口已基本完成
- 下一步重点不是再改命名或概念，而是补 runtime 行为
- `discussion/codex-starter-refactor/` 已成为这轮重构的 canonical 跟踪目录

## 本轮必读文件

继续这轮重构前，优先读：

1. [CONTEXT.md](/workspace/agent-skills/discussion/codex-starter-refactor/CONTEXT.md)
2. [PLAN.md](/workspace/agent-skills/discussion/codex-starter-refactor/PLAN.md)

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

- `discussion/history/2026-03-30-0044-middle-role-rename-and-plan-sync.md`
- `discussion/history/2026-03-30-0033-codex-starter-middle-layer-refactor.md`
- `discussion/history/2026-03-29-1740-story-term-next-context.md`
- `discussion/history/2026-03-29-1622-discussion-sync-intent.md`
