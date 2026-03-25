# 使用说明

## 安装到项目里

1. 将 `CLAUDE.md` 和 `.claude/` 复制到目标仓库根目录。
2. 除非你明确要启用运行时 hooks，否则保持 `.claude/settings.json` 原样不动。
3. 从 `/Aide` 开始。

## 首次进入项目

可以这样用：

```text
/Aide
/Aide 修一下登录回调的 bug
```

首次运行时，`/Aide` 应该：

- 简短问候
- 扫描仓库
- 更新 `.claude/project-profile.md`
- 输出简短项目简报
- 给出当前任务最轻可行的角色/模块组合建议

## 后续进入项目

后续回合里，`/Aide` 通常应该：

- 不再重复问候
- 复用已记录的项目画像
- 直接响应当前任务
- 只有在任务类型、风险或模块组合变化时才补充新的路由建议

## 常见任务路径

### 小 bugfix

```text
/Aide -> 直接实现 -> 定向验证
```

通常跳过：

- `prd`
- `architect`
- `plan`
- `workspace prep`
- `tester`
- `coder`
- 内部编排
- `/qc`
- `/follow`

### 功能开发

```text
/Aide -> 可选 prd -> 可选 architect -> conduct -> 可选 plan -> 实现
```

以下情况启用 `prd`：

- 范围不清
- MVP 不清
- 成功标准不清

以下情况启用 `architect`：

- 边界不清
- 接口不清
- 集成设计需要单独澄清

以下情况启用 `plan`：

- 需要稳定的实施说明
- 需要 handoff
- 需要把验证要求写清楚

### 重构

默认从 `direct` 开始。

只有在这些情况下才升级：

- 涉及共享接口
- 需要明确写下“行为不变”边界
- 出现多步骤或 handoff

### 发布

默认从 `orchestrated` 开始。

典型路径：

```text
/Aide -> conduct -> 可选 /qc -> 可选 /follow
```

## Workspace Prep

`workspace prep` 归 `conduct` 所有，不归 `/Aide`。

只有在执行真正需要时才启用，例如：

- 需要独立 branch 或 worktree
- 需要安装或刷新依赖
- 需要启动本地服务、数据库或容器
- 在编码或测试前需要做一次窄范围 readiness check

以下情况通常跳过：

- 小 bugfix
- 文档、prompt、配置小改
- 当前工作区已经 ready

## 治理动作

通过 `/Aide` 触发持久治理动作：

```text
/Aide audit
/Aide dedup
/Aide prune
/Aide 以后叫我老周
/Aide 不要让 tester 没跑真实命令就宣称 red phase 完成
```

这些动作包括：

- 审计
- 去重
- 长期规则写回
- 称呼偏好更新

## QC 和 Follow

这些场景适合使用 `/qc`：

- 任务风险较高
- 需要显式审计
- 发布前需要更强信心

这些场景适合使用 `/follow`：

- 代码已经推送
- 需要关注 CI 状态
- 需要发布后续跟进

## 可选 Hooks

`.claude/settings.json` 默认关闭 hooks。

只有当项目确实需要运行时自动化时才启用：

1. 查看 `.claude/settings.hooks.example.json`
2. 将需要的 hooks 配置复制到 `.claude/settings.json`
3. 确认 `node` 已在 `PATH` 中可用

启用后，运行态状态文件会按需创建在 `.claude/state/runtime-state.json`。
