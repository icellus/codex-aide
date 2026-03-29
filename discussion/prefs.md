# Discussion Prefs

Updated: 2026-03-29 16:26 Asia/Shanghai

## 长期偏好

- 默认中文回复
- 保留称呼 `Boss`
- 方案优先轻量、直接、可续接，不为了“完整”引入复杂机制
- 不希望被迫记忆固定命令，允许用自然语言或口语化表达触发 `discussion` 同步
- `同步disc` 是常用简称，但不是唯一触发词
- 不向用户暴露 `intake`、`route`、`delivery mode` 这类内部术语
- `Aide` 要像真实秘书 / 协调者，而不是 generic AI 或流程引擎
- 优先依据真实证据，优先看真实日志，不靠抽象假想主导结论

## discussion 同步偏好

- 当用户明显在表达“恢复上次上下文”“把本次进展记给下次”“同步 discussion/disc”这类意思时，应直接识别为 `discussion` 同步意图
- 同一个意图同时覆盖两类动作：
  新会话读取 `prefs.md -> current.md -> 必要 history`
  收尾时写入 `history` 并更新 `current.md`
- 如果用户同时补充“这次要记住什么”“下次先做什么”“哪些风险要盯住”，应一并写入本次 history 和记入新的 current
- 除非用户明确要求，不要要求他使用固定句式
- `discussion` 的时间记录统一按 `Asia/Shanghai` 维护

## 仓库稳定边界

- 本仓库当前只维护 `codex-starter`
- `claude-starter` 已迁出到仓库外 `/workspace/claude-starter`，仓库内只保留归档说明
- 根目录 `AGENTS.md` 只用于维护本仓库
- `codex-starter/AGENTS.md` 才是 starter 安装到目标仓库后的运行时权威

## 默认验证入口

- 仓库级默认验证：`node tests/codex-starter/run.mjs`
- 明确 write set 的定向验证：`node tests/codex-starter/run.mjs --file <path> --file <path>`
- 涉及 runner / manifest / shared helpers / 多层测试结构时：`node tests/codex-starter/run.mjs --suite full`
