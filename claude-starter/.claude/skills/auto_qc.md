# auto_qc - 自动质量检查

> 类型：Skill（按需自动触发）
> 作用：当当前任务明确启用 QC，并且 tester / coder 报告完成时，自动触发相应的 `/qc` 检查。

## 核心原则

- 只有在 `project-profile.md` 明确启用 QC 时才自动触发
- 自动触发的是**审计**，不是自动提交/自动推送
- QC 通过后，由 Main Agent 决定下一步，而不是默认做 git 操作
- QC 失败后，阻塞当前 handoff，并把问题反馈给对应角色修复

## 何时触发

### 触发条件

同时满足以下条件时才触发：

1. 收到 `tester` 或 `coder` 的完成报告
2. `.claude/project-profile.md` 的 `QC policy` 为 `enabled` 或 `required`，或 `Enabled modules` 明确包含 `/qc`
3. 当前输入不是单纯的进度更新、求助或未完成状态

### 不触发场景

- 当前任务未启用 QC
- subagent 报告阻塞、求助、仅同步进度
- 用户手动运行 `/qc`

## 触发后的行为

### tester 完成后

内部等效为：

```bash
/qc --phase=tester
```

### coder 完成后

内部等效为：

```bash
/qc --phase=coder
```

## 结果处理

### QC 通过

- `tester` 阶段通过：
  - Main Agent 决定是否进入 `coder` 阶段，或是否继续保持轻量流程
- `coder` 阶段通过：
  - Main Agent 决定是否需要 `/follow`、人工 review、或显式 git 操作

### QC 失败

- 明确列出问题并阻塞当前 handoff
- 把问题反馈给对应 subagent 修复
- 修复后再次收到完成报告时，可再次自动触发 QC

## 失败模式记录

每次 QC 失败后：

- 更新当前 plan 或任务条目的 `QC retry pattern`
- 当同类问题反复出现时，加入 `Learning Queue`
- 在回顾阶段再决定是否真正写回 `/Aide`

推荐分类：

- `missing-test`
- `fake-test`
- `missing-implementation`
- `placeholder`
- `plan-mismatch`
- `error-handling`
- `shared-protocol`
- `environment-mismatch`

## 与手动 `/qc` 的关系

| 场景 | auto_qc | 手动 `/qc` |
| --- | --- | --- |
| 触发方式 | Main Agent 按条件自动触发 | 用户显式调用 |
| 是否要求 QC 已启用 | 是 | 否 |
| 成功后的处理 | 由 Main Agent 决定下一步 | 由用户或 Main Agent 决定下一步 |
| 是否自动提交推送 | 否 | 否 |

## 输出要求

输出应包含：

- 触发原因
- 触发阶段：`tester` 或 `coder`
- QC 结论
- 下一步建议

若未触发，也应说明原因，例如：

- 当前任务未启用 QC
- 输入不构成完成报告
