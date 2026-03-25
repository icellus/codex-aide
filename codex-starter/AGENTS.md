# Project Agent Rules

## Language

默认使用中文回答，除非用户明确要求使用其他语言。

技术名词、命令、代码、文件路径保持原始英文。

## Scope

本文件约束整个项目目录树。

开始工作前，优先查看：

- `.codex/references/project-map.md`
- `.codex/references/dev-commands.md`
- `.codex/references/coding-rules.md`
- `.codex/references/test-strategy.md`
- `.codex/references/external-apis.md`

## Working Style

- 先给结论，再给命令、代码或补丁
- 用户明确说“先讨论 / 先分析”时，不要直接改文件
- 默认优先最小可行改动，避免顺手重构无关内容
- 搜索优先用 `rg` / `rg --files`
- 读取大文件时先看结构，再决定是否全文读取

## Shell / CLI

- 默认使用 bash / sh 风格命令
- 在 Windows 环境下，命令展示优先保持 bash / sh 风格
- 执行时优先选择稳定的 CLI 程序，如 `rg`、`git`、`node`、`curl`
- 不要默认假设 Git Bash 进程本身可用；只有确认可用时才通过 `bash -lc` 执行
- 除非明显依赖 PowerShell 语法或 Windows 专属命令，否则不要默认使用 PowerShell cmdlet
- 优先使用通用 CLI 工具，如 `rg`、`ls`、`find`、`sed`、`grep`

## Git / Safety

- 非用户明确要求时，不自动执行 `git commit`
- 避免破坏性命令，如 `git reset --hard`、批量删除、覆盖式重写
- 默认优先安全、可回退的操作

## Editing

- 新增或修改文本文件时默认使用 UTF-8
- 未明确要求时优先使用 LF 换行
- 修改代码后，优先运行最接近变更范围的验证命令
