# Backlog Note

Updated: 2026-03-29 22:13 Asia/Shanghai
Priority: very-low
Status: parked
Topic: active task lookup miss 下的 fallback 绑定观察项

## 现象

这里的“丢失”不是 task 数据对象消失，而是 runtime 在处理事件时没有解析到当前 active task：

- 没有显式 `task_id` / `currentTaskId`
- `task-registry.json` 的 `currentTaskId` 缺失、被清空或未同步
- `cwd/worktree/branch` 也无法唯一定位到 task

此时 `workflow.required_handoff_task_id` 会成为异常态下的 fallback 作用域来源。

## 当前状态

- `tester success` 的 fallback 绑定已修
- `task_settled` 阻断的 fallback 绑定已修
- 目前没有 blocker，也不是当前主焦点

## 仅在这些迹象出现时回想

- runtime 调试时看到 `pendingActions` / `blocked_review` / `aide_review` 中出现异常的 `taskId: null`
- `currentTaskId` 丢失、registry 被清空或 active task 无法解析
- 后续 reviewer 明确指出 `qc` 或 `session_end` 的 lookup miss fallback 路径需要补验证

## 当前不急着做的事

- 给 `qc` 事件补一条“lookup miss + fallback 绑定”的专门 smoke
- 给 `session_end` 事件补一条同类 smoke

## 处理优先级判断

这类问题默认视为异常态下的低优先级观察项。
只有相关症状真的出现，或者有人明确要求补齐异常态覆盖时，才从 backlog 提升出来处理。
