# Discussion Prefs

Updated: 2026-03-29 22:13 Asia/Shanghai

## 长期偏好

- 默认中文回复
- 方案优先轻量、直接、可续接，不为了“完整”引入复杂机制
- 不希望被迫记忆固定命令，允许用自然语言或口语化表达触发 `discussion` 同步
- `同步disc` 是常用简称，但不是唯一触发词
- 优先依据真实证据，优先看真实日志，不靠抽象假想主导结论

## review 时机偏好（宿主维护流程）

- `code review` / `reviewer` 默认在 worker 已产出真实改动后执行
- 实现审查必须基于真实 diff、实现结果、验证结果，不以纯预期或草案替代
- 与实现并行进行的审查仅标记为“设计审查/方案审查”，不能当成实现 review
- 设计/方案审查不能替代实现落地后的正式 review

## 子线程与验证流程偏好（宿主维护流程）

- 涉及明确编码交付时，若需要并行子线程，优先按明确边界拆分，不默认再拆“代码线程 + 旧测试线程”
- 默认使用清晰、可完成的子线程 prompt，明确 write set、设计边界、完成标准、验证方式；不要把含糊任务直接丢给子线程
- 除非特别必要，不默认 `fork_context: true`
- 代码产出后，由主线程统一做验证与 review；验证不再默认依赖旧 `tests/codex-starter` 脚本
- 最终 reviewer 无 blocking findings 后，再向用户汇报结果

## discussion 同步偏好

- 当用户明显在表达“恢复上次上下文”“把本次进展记给下次”“同步 discussion/disc”这类意思时，应直接识别为 `discussion` 同步意图
- 同一个意图同时覆盖两类动作：
  新会话读取 `prefs.md -> current.md -> 必要 history`
  收尾时写入 `history` 并更新 `current.md`
- 如果用户同时补充“这次要记住什么”“下次先做什么”“哪些风险要盯住”，应一并写入本次 history 和记入新的 current
- 除非用户明确要求，不要要求他使用固定句式
- `discussion` 的时间记录统一按 `Asia/Shanghai` 维护
- 低优先级、非当前焦点、明确“有时间精力再处理”的问题，单独放进 `discussion/backlog/`，不要混入 `current.md` 或常规 `history/`
- `discussion/backlog/` 里的内容只有在用户明确提起，或当前问题与其症状高度一致时才回看

## 仓库稳定边界

- 本仓库当前只维护 `codex-starter`
- `claude-starter` 已迁出到仓库外 `/workspace/claude-starter`，仓库内只保留归档说明
- 根目录 `AGENTS.md` 只用于维护本仓库
- `codex-starter/AGENTS.md` 才是 starter 安装到目标仓库后的运行时权威
- 维护 `/workspace/agent-skills` 会话时，`codex-starter/**` 是被开发对象，不是当前宿主会话 authority
- 不把 starter 的运行时 prompt、persona、route/routing 规则反向写进宿主层 `discussion/*`
- 上述隔离是宿主硬约束，不削弱 starter 安装到目标仓库后的运行时 authority

## 默认验证入口

- 旧 `tests/codex-starter` 测试脚本已移除，不再默认依赖固定 runner
- 默认选择与当前任务最相关、最小且真实可执行的验证命令
- 若当前任务没有可靠自动化验证，应明确记录“未验证”、原因与风险
