# codex-starter 中文指南

这份文档面向第一次接入 `codex-starter` 的使用者。

它回答的是当前这版 starter 的核心问题：

- 这套 starter 现在是什么
- 应该复制哪些文件
- `AGENTS.md`、`.agents/`、`.codex/`、`.product/` 分别负责什么
- coding 线和 product 线怎么区分
- `/Aide` 在 product 任务里到底负责什么

## 1. 这套 Starter 现在是什么

`codex-starter` 是一套项目本地的 Codex 工作流骨架。

当前版本有两条交付线：

- coding：代码改动、验证、审计、受控交付
- product：文档和其他非代码交付

它的目标不是把每个任务都拉进重流程，而是：

- 默认保持轻量
- 只有任务真的需要时再升级
- 把 intake、治理、执行、非代码沉淀拆开
- 减少主会话的无效上下文

## 2. 快速开始

把下面这些内容复制到目标仓库根目录：

1. `AGENTS.md`
2. `.agents/skills/`
3. `.codex/`
4. `.product/`
5. 可选复制 `docs/`
6. 可选复制 `tests/`

然后确认：

- 本地有 `node`
- 允许 runtime helpers 写入 `.codex/state/*.json`

首次使用通常是：

```text
/Aide
```

或者：

```text
/Aide 修复登录回调 bug
```

首次运行时，`/Aide` 应该：

- 扫描仓库
- 更新热状态
- 更新仓库级验证基线
- 选择当前任务最轻且合理的路线

## 3. 目录结构

当前 starter 使用四层结构。

### `AGENTS.md`

负责：

- 全局入口
- slash command 到 skill 的映射
- 运行时文件总览
- 少量全局 guardrails

### `.agents/`

负责：

- skill 契约
- `/Aide`、`/qc`、`/submit` 等入口协议

约定路径：

```text
.agents/skills/*/SKILL.md
```

### `.codex/`

负责：

- 路由策略
- 子代理定义
- 热状态和运行时状态
- 运行时脚本
- coding 线相关辅助产物

典型内容：

- `.codex/agents/*.toml`
- `.codex/routing-policy.md`
- `.codex/state/*.json`
- `.codex/scripts/*.mjs`
- `.codex/validation-profile.json`

### `.product/`

负责：

- product 线模板
- product 线轻量记忆
- product 线进化候选

典型内容：

- `.product/templates/`
- `.product/registry.json`
- `.product/memory.json`
- `.product/evolution.json`

这里有三个当前约束：

- 当前对话优先于旧记忆
- 只有明确或重复出现的偏好才值得沉淀
- 进化候选必须结合真实聊天记录再审核

## 4. 两条交付线

### Coding 线

当主要交付物是下面这些内容时，走 coding 线：

- 代码实现
- 行为改动
- 任务级验证
- release 或受控交付

典型路径：

```text
/Aide -> optional conduct -> optional plan -> tester/coder -> optional /qc -> optional /submit
```

### Product 线

当主要交付物是下面这些内容时，走 product 线：

- 文档
- API 描述
- 结构化非代码内容
- 打包交付物
- 其他非代码输出

典型路径：

```text
/Aide -> product_assistant
```

`product_assistant` 可以在需要时读取代码、配置、接口定义等技术材料。  
但输出要匹配目标受众，避免 AI 腔和不必要的实现噪音。

## 5. `/Aide` 在 Product 任务里负责什么

`/Aide` 在 product 任务里不替代 `product_assistant` 做业务。

它主要负责：

- intake 和路由
- 结合真实聊天记录复审 product 结果
- 判断 `.product/*` 写回是否合理
- 在完成边界不稳时，做轻量反馈确认
- 判断问题到底是：
  - 用户信息不够
  - 理解偏差
  - 还是本来就该切到 coding 线

所以你可以这样理解：

- `product_assistant` 负责交付
- `/Aide` 负责审理解、审沉淀、审边界

## 6. 三种交付形态

### `lightweight`

适合：

- 小 bugfix
- 局部清晰任务
- 直接可落的 product 任务

### `standard`

适合：

- 受益于一个计划产物的任务
- 但还没复杂到要 long-running 跟踪

### `long-running`

适合：

- 跨 session
- 多 checkpoint
- 发布
- 风险更高的任务

`environment setup` 属于 `conduct`，不属于 `/Aide`。

## 7. Runtime Helpers

常用入口：

1. `node .codex/scripts/task-overview.mjs`
2. `node .codex/scripts/aide-evolution.mjs`
3. `node .codex/scripts/aide-governance.mjs`
4. `node .codex/scripts/session-context.mjs`
5. `printf '%s\n' '{"event":"subagent_result","role":"coder","status":"complete","message":"...","cwd":"..."}' | node .codex/scripts/runtime-state.mjs`
6. `printf '%s\n' '{"command":"git add ."}' | node .codex/scripts/validate-git.mjs`

这些脚本是可选的。  
启用后可以提供：

- task / session 提醒
- git 安全检查
- runtime state 跟踪
- 低成本 `/Aide` evolution sweep
- coding 线的自动 QC / submit 跟进
- product 线结果的最小 `/Aide` 审核接线

## 8. 建议阅读顺序

如果你第一次接入，建议按这个顺序看：

1. `README.md`
2. `docs/overview.zh-CN.md`
3. `docs/usage.zh-CN.md`
4. 本文
5. `docs/detailed-guide.zh-CN.md`
