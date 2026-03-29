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

这个脚本会刷新 starter 管理的文件，并把复制过去的 starter 内容整体补进 `.gitignore`：
`AGENTS.md`、`.agents/`、`.codex/`、`.product/`。
它会安装一个最小化的项目级 `.codex/config.toml`，里面只开启 repo-local Codex hooks；同时复制 `.codex/hooks.json` 和 `.codex/hooks/`，只在缺失时补入基础的 `task-context.json`、`repo-context.json`、`task-registry.json`，保留已有 `.codex/state/` 与 `.codex/logs/`，并且不会把 source 仓库里的 runtime 历史一起带到目标仓库。

`Aide`、`qc`、`submit` 是逻辑路由别名。
如果客户端不支持自定义 slash command，就不要提示用户输入 `/Aide`、`/qc`、`/submit`。
自然语言请求应映射到同一路由。

## 首次运行

使用下面任意一种：

```text
帮我看一下当前仓库状态，并选最轻的路线。
修复登录回调 bug。
```

如果新线程一开始没有显式支持的路由别名，就默认由 `Aide` 接住用户第一条消息。

首次运行时，`Aide` 应该：

- 用中文做温暖、灵动、贴合当前消息的开场
- 默认称呼固定为 `Boss`，除非用户明确要求修改
- 如果用户已经给出任务，就直接承接任务，不要再追问泛泛的“有什么我可以帮你”
- 获取足以安全路由的仓库上下文
- 更新 `.codex/state/task-context.json`
- 更新 `.codex/state/repo-context.json`
- 更新 `.codex/project-profile.md`
- 更新 `.codex/validation-profile.json`
- 用自然语言说明下一步该由谁接手、要做什么、为什么

当前没有独立的 repo scan 脚本。
`Aide` 负责协调 repo scan，通过针对性的仓库检索和可选的只读探索完成。
如果是 read-heavy 分析或 owner 不清晰，优先启用短生命周期、只读的 `repo_explorer` 子代理，再由 `Aide` 汇总并对用户回复。

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
- 如果分析任务 read-heavy，阅读部分默认交给 `repo_explorer`，`Aide` 负责对用户收口

如果用户要的是明确的仓库改动或其他持久产物：

- `Aide` 要尽快分派，不要自己下场实现
- `Aide` 应保持“代办/协调/收口”角色，而不是主力深度排查者
- 优先用最少的边界信息完成分派，不要先做一轮很深的本地读代码
- 默认只启用完成当前任务所需的最小团队
- 新 task chain 能分派时优先用真实子代理，减少主线程上下文污染
- 不要仅仅因为新仓库或缓存上下文偏薄，就把整支团队都激活
- 详细的实现阅读应交给真正执行的角色

仓库里的 `.codex/*.json`、`.codex/project-profile.md`、`.product/*.json` 都是 starter 默认值。真实项目中应在正常使用里持续演进。

## 路由别名

| 别名 | 适用场景 |
| --- | --- |
| `Aide`（支持时可写 `/Aide`） | 首轮接应、协调、治理、刷新状态 |
| `qc`（支持时可写 `/qc`） | coding 线任务需要显式审计 |
| `submit`（支持时可写 `/submit`） | coding 线任务需要进入受控交付 |

## 常见路径

| 任务 | 常见路径 |
| --- | --- |
| 小 bugfix | `Aide -> coder -> tester -> optional qc -> submit` |
| 较高风险 bugfix | `Aide -> tester -> coder -> tester -> optional qc -> submit` |
| feature | `Aide -> optional prd -> optional architect -> conduct -> optional plan -> tester -> coder -> tester -> optional qc -> submit` |
| discussion / Q&A | `Aide` 直接处理 |
| product | `Aide -> product_assistant` |
| release | `Aide -> conduct -> optional qc -> submit` |

进入正式 delivery routing 后，环境判断和准备由 `conduct` 负责。

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

只要 `coder` 参与，后续就必须有 `tester` handoff，才能进入 settle/submit。
`qc` 仍然是按风险启用的可选环节，不能替代 `tester`。
对非平凡行为改动，`tester` 负责任务级验证 handoff。

## Runtime Helpers

常用入口：

1. `node .codex/scripts/startup-context.mjs`
2. `node .codex/scripts/task-overview.mjs`
3. `node .codex/scripts/aide-evolution.mjs`
4. `node .codex/scripts/aide-governance.mjs`
5. `node .codex/scripts/session-context.mjs`
6. `printf '%s\n' '{"event":"subagent_result","role":"coder","status":"complete","message":"...","cwd":"..."}' | node .codex/scripts/runtime-state.mjs`
7. `printf '%s\n' '{"command":"git add ."}' | node .codex/scripts/validate-git.mjs`

repo-local Codex hooks 通过 `.codex/config.toml` 和 `.codex/hooks.json` 启用。项目级配置只写 `[features].codex_hooks = true`，所以其余默认值继续来自 `~/.codex/config.toml`，除非你在项目级显式覆盖。同样，Codex 只有在仓库被标记为 trusted 之后，才会加载项目级这一层配置。

hooks 启用后，原始生命周期事件会追加写入 `.codex/logs/codex-hooks/YYYY-MM-DD.jsonl`，用于后续分析 prompt、stop 和 Bash 使用情况。现有 runtime helper 的调用日志仍然写在 `.codex/logs/runtime-hooks/YYYY-MM-DD[.part-NNN].jsonl`。

对于 startup / resume，repo-local 的 `SessionStart` hook 会自动调用 `startup-context.mjs`。如果不是通过 hook 系统，而是从外部集成直接接线，仍然优先把 `startup-context.mjs` 当作单一入口；若调用位置不在目标仓库根目录，记得通过 `cwd`、`workdir`、`projectDir` 或 `CODEX_PROJECT_DIR` 显式传入目标仓库路径。

`runtime-state.json` 按需生成。runtime helper 日志会追加写入 `.codex/logs/runtime-hooks/YYYY-MM-DD[.part-NNN].jsonl`，其中包含 stdin、stdout、stderr，以及 runtime 管理的文件写入记录。单日日志过大时会自动切到编号分片。若仍存在旧的顶层 `.codex/logs/runtime-hooks.jsonl`，下一次 runtime hook 写日志时会自动迁移到按日分片文件并删除该残留文件。QC 提醒只会在当前任务明确启用了 `qc` 时出现。

## Smoke Test

```bash
node tests/runtime-hooks.smoke.mjs
```
