# Record: next-session bootstrap

Updated: 2026-03-29 16:12 Asia/Shanghai
Source: 由根目录 `NEXT_SESSION_CONTEXT.md` 迁入并保留为历史记录

## 当前状态

本仓库当前只维护 `codex-starter`。
`claude-starter` 已迁出到仓库外单独归档，仓库内只保留说明文件：

- [CLAUDE_STARTER_ARCHIVE.md](/workspace/agent-skills/CLAUDE_STARTER_ARCHIVE.md)

最近一轮关键提交：

- `e08247f`
- `refactor: streamline starter repo maintenance`

## 1. 本次对 `codex-starter` 的优化调整

这一轮已经完成的核心优化如下：

- 明确了 `Aide` 的定位：秘书 / 协调者 / people manager，不是默认实现者。
- 明确了 read-heavy 分析默认走 `Aide -> repo_explorer -> Aide`，避免 `Aide` 自己深挖仓库。
- 明确了 `conduct` 负责环境准备与 readiness 判断，不应把这类问题甩给 `tester` 或 `coder`。
- 明确了 `coder -> tester` 是强绑定链路：
  只要 `coder` 参与，后面就必须由 `tester` 接手；
  `qc` 只按风险决定，且不能替代 `tester`。
- 收紧了子线程策略：
  不再默认 `fork_context: true`；
  要按任务边界决定是否 fork；
  更强调最小完整上下文、明确 write set、减少 token 浪费。
- 新增了日志分析能力：
  [log-analysis.mjs](/workspace/agent-skills/codex-starter/.codex/scripts/log-analysis.mjs)
- 重构了测试体系：
  测试移到根目录 [tests/codex-starter](/workspace/agent-skills/tests/codex-starter)
  分成 `contract`、`behavior`、`mutation`、`smoke`
  统一入口为 [run.mjs](/workspace/agent-skills/tests/codex-starter/run.mjs)
- 新增了 manifest 驱动的测试选择：
  [manifest.mjs](/workspace/agent-skills/tests/codex-starter/manifest.mjs)
  现在可以按当前 worktree 或明确文件集自动选择最小必要 suite。
- 彻底区分了两个 `AGENTS.md`：
  根目录 [AGENTS.md](/workspace/agent-skills/AGENTS.md) 只用于本仓库维护；
  [codex-starter/AGENTS.md](/workspace/agent-skills/codex-starter/AGENTS.md) 才是 starter 安装到目标仓库后的运行时权威。

## 2. 继续读日志并修复时，必须盯住的内容

后续继续分析真实日志时，重点不要发散，要优先检查下面这些问题是否还在：

1. `Aide` 是否又重新滑回“自己重读仓库、自己做实现、自己做验证”的位置。
2. `repo_explorer` 是否真的被用起来，还是只在规则里存在。
3. `coder -> tester` 是否真的形成闭环，而不是 `coder` 结束后主线程自己补验证。
4. `qc` 是否被误用成 `tester` 的替代品。
5. 子线程是否真的按预期工作：
   - 是否应该 fork 却没 fork
   - 是否不该 fork 却把脏上下文整包塞进去
   - brief 是否足够完整
   - token 是否被无意义消耗
6. runtime 事件是否完整：
   - `subagent_result`
   - `task_settled`
   - `PreToolUse` / `PostToolUse` 配对
7. 工作流是否只是“写在 policy 里”，但真实运行没有按设计发生。
8. 用户侧回复是否又变回技术 memo，而不是 secretary/coordinator 风格。

## 3. 下一次方向仍然要以真实项目日志为主

下一轮的主方向不要回到抽象层设计，也不要只做 prompt 纸面优化。
优先级应保持为：

1. 在真实项目里跑真实任务
2. 收集真实 `.codex/logs`
3. 导入并分析这些日志
4. 找到实际越位、漏交接、假路由、假工作流
5. 再对 `codex-starter` 的 authority、routing、tests、runtime 进行收紧和修复

结论很明确：

- 后续修复要继续由真实日志驱动
- 不要靠假想 case 主导方向
- 不要为了“框架更完整”而脱离真实轨迹

## 4. 另一个必须继续推进的方向：验证当前工作流是否真的在运行

这点很关键。
几次真实测试里都已经暴露出一个问题：

- 设计中的工作流，并没有稳定地按设计运行

已经见过的典型异常包括：

- 理论上该 `coder -> tester`，实际没有发生
- 理论上该 `Aide -> repo_explorer -> Aide`，实际变成 `Aide` 自己深读
- 理论上该由子线程接住明确任务，实际主线程自己继续做
- 理论上 runtime 应记录关键 handoff / settled 事件，实际轨迹里看不到
- 理论上工作流已定义，实际跑起来像“人工临时补位”

所以下一轮不能只看“回复像不像”，还要专门验证：

1. 工作流是否真的被触发
2. handoff 是否真的发生
3. 角色边界是否真的落地
4. runtime/state/log 是否真的记录到了这些动作
5. 主线程是否仍在偷偷兜底，把本该属于工作流的问题掩盖掉

这条线本质上是在做：

- workflow reality check

不是只做文档对齐，也不是只做 prompt 对齐。

## 下次建议的直接切入方式

下次继续时，建议直接按下面顺序开始：

1. 先拿新的真实项目日志
2. 先跑日志分析，再人工复核关键会话
3. 先判断“工作流有没有真的运行”
4. 再判断“如果没运行，断在什么位置”
5. 最后才修改 `codex-starter`

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

## 用户偏好

这些偏好下次必须延续：

- 默认中文
- 保留称呼 `Boss`
- 不向用户暴露 `intake`、`route`、`delivery mode` 这类内部术语
- `Aide` 要像真实秘书 / 协调者，而不是 generic AI 或流程引擎
- 强调真实证据，优先看真实日志，不要沉迷理论修辞
