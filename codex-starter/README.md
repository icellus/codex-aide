# codex-starter

面向仓库内安装的 Codex 工作流基线。

## 安装

`install.sh` 放在 starter 根目录：

```bash
bash /path/to/agent-skills/codex-starter/install.sh
```

在目标仓库根目录执行时，安装器默认会：

- 删除目标仓库中的 `AGENTS.md`
- 删除目标仓库中的 `.codex/`
- 删除旧版遗留的 `.agents/` 与 `.product/`
- 完整复制当前 starter 的 `AGENTS.md` 和 `.codex/`

## 目录约定

当前结构按“版本化资产”和“运行态资产”分开：

- `AGENTS.md`
  运行时总入口与路由说明。
- `.codex/skills/`
  路由入口技能与角色技能。
- `.codex/agents/`
  可委派子代理定义。
- `.codex/context/`
  人类可读的项目上下文摘要。
- `.codex/state/`
  运行态权威目录；`.json` 是 repo-local live state，`.demo.json` 只提供结构示例，不参与运行时读取。
- `.codex/policies/`
  路由、验证、交付、演进等策略文件。
- `.codex/scripts/`
  启动任务概览、输入校验与共享运行时辅助脚本。
- `.codex/hooks/` 与 `.codex/hooks.json`
  仓库级 hooks。
- `.codex/templates/`
  按 planning / execution / progress 分组的模板。
- `.codex/product/`
  仓库持久化的产品侧记忆、注册表与演进记录。
- `.codex/logs/`
  本地日志目录。
- `.codex/progress/`
  本地进度快照与历史目录。

## 版本化边界

默认建议提交到仓库的内容：

- `AGENTS.md`
- `.codex/skills/**`
- `.codex/agents/**`
- `.codex/context/**`
- `.codex/policies/**`
- `.codex/scripts/**`
- `.codex/hooks/**`
- `.codex/templates/**`
- `.codex/product/**`
- `.codex/state/*.demo.json`
- `.codex/config.toml`
- `.codex/hooks.json`

默认建议忽略的本地运行态内容：

- `.codex/settings.local.json`
- `.codex/state/task-context.json`
- `.codex/state/repo-context.json`
- `.codex/state/governance-context.json`
- `.codex/state/submit-preferences.json`
- `.codex/state/pending-task-turn-result.json`
- `.codex/state/pending-governance-result.json`
- `.codex/logs/**`
- `.codex/progress/**`

## 设计原则

- 只保留一个隐藏根目录：`.codex/`
- 运行时技能、脚本、模板、产品记忆统一放在 `.codex/` 下，避免 `.agents/`、`.product/` 多根分散
- 根层只保留真正的入口文件，策略和上下文分别收进 `.codex/policies/` 与 `.codex/context/`
- 模板按 planning / execution / progress 分组，减少平铺文件带来的认知噪音
- 安装器默认采用 destructive replace：清理旧安装后整份复制新版本
- `AGENTS.md` 保留在仓库根目录，作为会话直接可见的运行时入口
