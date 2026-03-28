# 使用说明

这份文档用于解释使用方式，不是运行时权威。
运行时权威在 `AGENTS.md`、`.agents/skills/*/SKILL.md` 和 `.codex/routing-policy.md`。

英文文档是主版本。
中文文档是同步说明。

## 安装

1. 将 `AGENTS.md`、`.agents/skills/`、`.codex/`、`.product/` 复制到目标仓库根目录。
2. 如果需要 runtime helpers 或 smoke tests，确保 `node` 在 `PATH` 上可用。
3. 直接用自然语言说明需求。

也可以在目标仓库根目录执行：

```bash
bash /path/to/codex-starter/install.sh
```

这个脚本会递归覆盖 starter 文件，并把复制过去的 starter 内容整体补进 `.gitignore`：
`AGENTS.md`、`.agents/`、`.codex/`、`.product/`。

`Aide`、`qc`、`submit` 是逻辑路由别名。
如果客户端不支持自定义 slash command，就不要提示用户输入 `/Aide`、`/qc`、`/submit`。
自然语言请求应映射到同一路由。

## 首次运行

使用下面任意一种：

```text
帮我看一下当前仓库状态，并选最轻的路线。
修复登录回调 bug。
```

如果新线程一开始没有显式支持的路由别名，就把用户第一条消息按 `Aide` intake 处理。

首次运行时，默认的 `Aide` intake 应该：

- 用中文做温暖、灵动、贴合当前消息的开场
- 默认称呼固定为 `Boss`，除非用户明确要求修改
- 如果用户已经给出任务，就直接承接任务，不要再追问泛泛的“有什么我可以帮你”
- 扫描仓库
- 更新 `.codex/state/task-context.json`
- 更新 `.codex/state/repo-context.json`
- 更新 `.codex/project-profile.md`
- 更新 `.codex/validation-profile.json`
- 选择当前任务最轻且合理的路线

当前没有独立的 repo scan 脚本。
`Aide` 通过针对性的仓库检索和可选的只读探索完成 scan。

后续回合通常应：

- 跳过重复问候
- 先汇报当前 active task 和未结束历史任务
- 复用已有状态
- 只有在路由真的变化时才提变化
- 启动低成本 evolution sweep，但不阻塞首条 route

如果当前回合只是问答、分析、方案讨论或选项比较，而用户没有要求持久产物：

- `Aide` 直接回答
- 默认不启用执行角色
- 默认不写持久状态
- 只读取回答当前问题所需的最小上下文

仓库里的 `.codex/*.json`、`.codex/project-profile.md`、`.product/*.json` 都是 starter 默认值。真实项目中应在正常使用里持续演进。

## 路由别名

| 别名 | 适用场景 |
| --- | --- |
| `Aide`（支持时可写 `/Aide`） | intake、路由、治理、刷新状态 |
| `qc`（支持时可写 `/qc`） | coding 线任务需要显式审计 |
| `submit`（支持时可写 `/submit`） | coding 线任务需要进入受控交付 |

## 常见路径

| 任务 | 常见路径 |
| --- | --- |
| 小 bugfix | `Aide -> coder -> sanity checks -> submit` |
| 较高风险 bugfix | `Aide -> tester -> coder -> tester 或 qc -> submit` |
| feature | `Aide -> optional prd -> optional architect -> conduct -> optional plan -> tester -> coder -> optional qc -> submit` |
| discussion / Q&A | `Aide` 直接处理 |
| product | `Aide -> product_assistant` |
| release | `Aide -> conduct -> optional qc -> submit` |

## Product 任务

当主要交付物是非代码产物时，走 product 线。

例如：

- 文档
- API 描述
- 结构化内容文件
- 打包交付物
- 其他非代码输出

对 product 任务：

- `Aide` 路由到 `product_assistant`
- 一般不会启用 `tester`、`qc`、`submit`
- `product_assistant` 可以在需要时读取技术材料
- `.product/*` 写回应保持轻量
- `Aide` 在接受长期记忆或进化写回前，应先复看真实聊天记录

如果完成边界还不稳，`Aide` 应做简短、自然的反馈确认，而不是套固定问卷。

## Coding 任务

当主要交付物是下面这些内容时，走 coding 线：

- 代码实现
- 行为变更
- 任务级验证
- 受控交付

对非平凡行为改动，`tester` 负责任务级验证 handoff。

## Runtime Helpers

常用入口：

1. `node .codex/scripts/task-overview.mjs`
2. `node .codex/scripts/aide-evolution.mjs`
3. `node .codex/scripts/aide-governance.mjs`
4. `node .codex/scripts/session-context.mjs`
5. `printf '%s\n' '{"event":"subagent_result","role":"coder","status":"complete","message":"...","cwd":"..."}' | node .codex/scripts/runtime-state.mjs`
6. `printf '%s\n' '{"command":"git add ."}' | node .codex/scripts/validate-git.mjs`

`runtime-state.json` 按需生成。hook 日志会追加写入 `.codex/logs/runtime-hooks/YYYY-MM-DD.jsonl`，其中包含 stdin、stdout、stderr，以及 runtime 管理的文件写入记录。QC 提醒只会在当前任务明确启用了 `qc` 时出现。

## Smoke Test

```bash
node tests/runtime-hooks.smoke.mjs
```
