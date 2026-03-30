# codex-starter

面向仓库内安装的 Codex 工作流基线。

## 目录约定

当前结构按“版本化资产”和“运行态资产”分开：

- `AGENTS.md`
  运行时总入口与路由说明。
- `.codex/skills/`
  路由入口技能与角色技能。
- `.codex/agents/`
  可委派子代理定义。
- `.codex/scripts/`
  启动、治理、状态同步、日志分析等脚本。
- `.codex/hooks/` 与 `.codex/hooks.json`
  仓库级 hooks。
- `.codex/templates/`
  PRD、架构、实施说明、进度与验证交接模板。
- `.codex/product/`
  仓库持久化的产品侧记忆、注册表与演进记录。
- `.codex/defaults/state/`
  本地运行态状态文件的种子模板。
- `.codex/state/`
  本地运行态状态目录；安装时由 `.codex/defaults/state/` 初始化缺失文件。
- `.codex/logs/`
  本地日志目录。
- `.codex/progress/`
  本地进度快照与历史目录。

## 版本化边界

默认建议提交到仓库的内容：

- `AGENTS.md`
- `.codex/skills/**`
- `.codex/agents/**`
- `.codex/scripts/**`
- `.codex/hooks/**`
- `.codex/templates/**`
- `.codex/product/**`
- `.codex/defaults/**`
- `.codex/*.md`
- `.codex/*.json`
- `.codex/config.toml`

默认建议忽略的本地运行态内容：

- `.codex/settings.local.json`
- `.codex/state/**`
- `.codex/logs/**`
- `.codex/progress/**`

## 设计原则

- 只保留一个隐藏根目录：`.codex/`
- 运行时技能、脚本、模板、产品记忆统一放在 `.codex/` 下，避免 `.agents/`、`.product/` 多根分散
- 本地状态使用 `.codex/defaults/state/` 作为种子来源，避免把运行中的 `.codex/state/*.json` 当作 starter 源文件维护
- `AGENTS.md` 保留在仓库根目录，作为会话直接可见的运行时入口
