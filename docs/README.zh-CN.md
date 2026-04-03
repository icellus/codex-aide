# Codex Aide 简介

[English](../README.md)

如有歧义，以英文主文件为准。

`Codex Aide` 是一个面向 Codex 工作流的受治理仓库启动包，用来把执行、校验和交付相关的运行时约定安装到目标仓库中。

它不是一组零散 prompt，也不是只靠人工约定维护的一次性模板。它的目标是把一套可重复的运行时结构安装进仓库，让 Codex 在真实项目里具备明确的权威边界、持久化状态、校验基线和受治理的交付流程。

## 它会提供什么

安装完成后，目标仓库会得到：

- 顶层 `AGENTS.md`，用于定义 codex-aide 的入口边界和顶层权威映射
- `.codex/aide/` 运行时目录，包含 policies、skills、agents、hooks、templates 和辅助脚本
- `.codex/aide/AGENTS.md`，用于约束 `.codex/aide/**` 子树的运行时边界
- 用于任务跟踪、治理上下文、submit 偏好、长任务进度的持久化运行态文件
- 面向验证、提交、推送和后续收尾的受治理交付链路

## Contract 模型

`Codex Aide` 现在使用分层 authority，而不是把所有运行时规则都塞进仓库根级 `AGENTS.md`。

- 根级 `AGENTS.md` 刻意保持精简
- `.codex/aide/AGENTS.md` 负责约束 codex-aide 的 runtime 子树
- `.codex/aide/skills/*/SKILL.md` 与 `.codex/aide/agents/*.toml` 负责各角色行为

这样做的目的，是让根级 contract 更容易和用户仓库已有说明共存，同时把完整的 codex-aide runtime contract 保留在 `.codex/aide/**` 内部。

## 与其他 Skill 的兼容

`Codex Aide` 默认按“可共存，但不隐式接管”的方式与其他 skill 兼容。

- 其他 skill 可以继续存在于同一仓库，或者存在于外部 skill 位置
- codex-aide 把自己的 route、state、governance 和 delivery authority 保持在 `.codex/aide/**`
- 其他 skill 默认不会进入 codex-aide 的 `next_owner`、`sticky_owner`、governance writeback 或 runtime state ownership

也就是说，安装后的默认兼容模型是“共存”，而不是“自动接入 codex-aide 路由图”。

如果你希望 Codex 在多个任务、多个会话、多个仓库里保持一致行为，而不是每次都重新拼接提示词，这个包就是为这种场景设计的。

## 安装

目标：

- 一个你准备初始化的目标仓库根目录

### 通过 npm 安装

要求：

- Node.js `>=20`

先安装 CLI：

```bash
npm i -g @icellus/codex-aide
```

然后在目标仓库根目录执行：

```bash
code-aide install
```

也可以显式指定目标目录：

```bash
code-aide install --target /path/to/repo
```

只看安装计划而不落盘：

```bash
code-aide install --dry-run
```

### 不依赖 Node.js 的手动安装

如果你不想依赖 npm 或 Node.js，也可以直接手动 copy starter 文件到目标仓库。

先拿到源码，可以选择 clone 仓库，或者从 GitHub 下载源码压缩包并解压：

```bash
git clone https://github.com/icellus/codex-aide.git
cd codex-aide
```

然后把 starter 文件复制到目标仓库：

```bash
cp starter/AGENTS.md /path/to/repo/AGENTS.md
mkdir -p /path/to/repo/.codex
cp -R starter/aide /path/to/repo/.codex/aide
```

手动安装和安装器使用同一套落地目录，但它不会自动应用安装器的保护逻辑。也就是说：

- 不会自动把 codex-aide 的根级 contract 合并到已存在的 `AGENTS.md`
- 不会自动保留本地运行态文件
- 不会区分“随包静态文件”和“仓库本地运行态文件”

所以这条路径更适合：

- 初始化一个干净目标仓库
- 你希望自己控制每个文件的覆盖行为
- 你准备手工检查 `.codex/aide` 下已有运行态内容后再合并

### 升级说明

当前的 `code-aide install` 可以重复执行，用来刷新随包运行时文件和 codex-aide 的根级 contract。

- 如果目标仓库根目录已经有 `AGENTS.md`，安装器会把 codex-aide 的受管 contract 置顶或更新，并保留原有内容
- `.codex/aide/**` 下的随包静态文件会刷新到最新 starter 版本
- 仓库本地运行态文件会继续保留

推荐的手工升级流程：

1. 获取最新的 `codex-aide` 源码树或发布压缩包。
2. 在替换仓库根级 contract 前先审阅 `starter/AGENTS.md` 和 `starter/aide/AGENTS.md`。
3. 刷新 `.codex/aide/**` 下的随包静态文件。
4. 保留仓库本地运行态文件，不要直接覆盖。

## 安装后的目录结构

发布包内部维护的是 starter 形态：

```text
starter/AGENTS.md
starter/aide/AGENTS.md
starter/aide/**
```

安装器会把它映射成目标仓库里的运行时结构：

```text
starter/AGENTS.md   -> <repo>/AGENTS.md
starter/aide/AGENTS.md -> <repo>/.codex/aide/AGENTS.md
starter/aide/**     -> <repo>/.codex/aide/**
```

因此安装完成后，目标仓库中至少会出现：

```text
AGENTS.md
.codex/aide/
.codex/aide/AGENTS.md
```

当安装器需要把 codex-aide contract 合并到已有的顶层 `AGENTS.md` 时，会使用 `<!-- codex-aide:start -->` / `<!-- codex-aide:end -->` 标记包住受管区块，便于后续刷新。

这里的合并策略是刻意收敛的：

- codex-aide 只管理自己在顶层的 contract 区块
- 用户仓库原有的说明内容会继续保留在受管区块之后
- 安装器不会尝试重写、规整或解释用户 `AGENTS.md` 里剩余的内容

## 运行态本地文件

无论你是在做手动安装检查，还是在做手工升级，下面这些运行态本地路径通常都应该保留，而不是从包里直接覆盖：

- `.codex/aide/state/*.json`，但不含 `*.demo.json`
- `.codex/aide/context/project-profile.md`
- `.codex/aide/policies/validation-profile.json`
- `.codex/aide/progress/**`
- `.codex/aide/logs/**`
- `.codex/aide/artifacts/**`
- `.codex/aide/product/**`

这意味着像 `.codex/aide/policies/routing-policy.md` 这类随包静态配置通常可以刷新，而 `task-context.json` 这类运行态文件通常应该保留。

## CLI

```bash
code-aide --help
code-aide --version
code-aide install [--target <dir>] [--dry-run]
```

## 仓库维护

如果你维护的是这个包本身，而不是它安装后的目标仓库，可以使用：

```bash
node scripts/validate-codex-aide-dev.mjs full
npm pack --dry-run
```

## 许可证

MIT
