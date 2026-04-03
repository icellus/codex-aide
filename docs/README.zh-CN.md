<p align="center">
  <img src="assets/codex-aide-hero.svg" alt="codex-aide hero" width="960" />
</p>

<h1 align="center">codex-aide</h1>

<p align="center">
  <strong>给现有仓库装上一套适合 Codex 的工作流。</strong>
</p>

<p align="center">
  适合本来就在用 <strong>Codex</strong> 的仓库。如果你平时通过 <strong>Codex CLI</strong> 或兼容客户端工作，codex-aide 可以直接接进这套现有流程，并把它收拢成更清楚的治理结构。
</p>

<table align="center">
  <tr>
    <td align="center"><a href="#quick-start"><strong>快速开始</strong></a></td>
    <td align="center"><a href="#installation"><strong>安装方式</strong></a></td>
    <td align="center"><a href="#built-for-codex"><strong>适用于 Codex</strong></a></td>
    <td align="center"><a href="#repository-docs"><strong>文档</strong></a></td>
    <td align="center"><a href="../README.md"><strong>English</strong></a></td>
  </tr>
</table>

如有歧义，以 [英文主文件](../README.md) 为准。

## ✨ 为什么用 codex-aide

很多 Codex 用法一开始都来自零散 prompt、局部规则和手工复制的说明。短期能跑起来，但仓库一多、会话一长，就很容易漂。

`codex-aide` 做的事，就是把这些约定收拢成一套可以安装进仓库的工作流结构：

- 在仓库根目录保留一个稳定入口
- 把工作流相关文件集中放到 `.codex/aide/` 子树下
- 给仓库提供一套更容易审阅和刷新的治理结构
- 为持续中的工作保存持久化状态和上下文
- 让安装和后续刷新都有一条可重复执行的路径

| 没有 codex-aide | 使用 codex-aide |
| --- | --- |
| 根目录说明越写越厚 | 工作流相关文件集中留在 `.codex/aide/` |
| 多个仓库之间的设置容易漂移 | 同一套 starter 可以重复安装 |
| 长任务过程里的状态容易丢 | 工作流状态和仓库一起保存 |
| 工作流和验证流程依赖个人习惯 | starter 自带一致、可治理的工作流基线 |

<h2 id="quick-start">🚀 快速开始</h2>

要求：

- 通过 npm 安装时需要 Node.js `>=20`
- 目标仓库需要通过 Codex CLI 或兼容 Codex 的客户端使用

从下面任选一种安装方式。

<h2 id="installation">📦 安装方式</h2>

<table>
  <tr>
    <td align="center" width="33%">
      <strong>📦 npm 安装</strong><br />
      标准且最快的路径
    </td>
    <td align="center" width="33%">
      <strong>🌐 git 安装</strong><br />
      拉取 starter 后直接复制
    </td>
    <td align="center" width="33%">
      <strong>🤖 AI 安装</strong><br />
      让 coding agent 代为完成安装
    </td>
  </tr>
</table>

### 1. npm

适合本地可以直接使用 Node.js 的情况。

```bash
npm i -g @icellus/codex-aide
cd /path/to/your/repo
code-aide install
```

可选参数：

```bash
code-aide install --target /path/to/repo
code-aide install --dry-run
```

### 2. 通过 git 安装

适合你希望直接拉取 starter，并自己把文件落到仓库里的情况。

```bash
git clone --depth 1 https://github.com/icellus/codex-aide.git /tmp/codex-aide
cd /tmp/codex-aide

cp starter/AGENTS.md /path/to/repo/AGENTS.md
mkdir -p /path/to/repo/.codex
cp -R starter/aide /path/to/repo/.codex/aide
```

这条路径使用的是同一套 starter 结构，但不会自动应用安装器的合并和保留逻辑。

### 3. 通过 AI 安装

适合你希望让 coding agent 在当前仓库里直接完成安装的情况。

把下面这句指令发给你的 agent：

```text
Follow https://raw.githubusercontent.com/icellus/codex-aide/master/INSTALL.md to install codex-aide into the current repository.
```

安装说明位于 [INSTALL.md](../INSTALL.md)。

<h2 id="what-gets-installed">🧱 安装后会得到什么</h2>

发布包里带的是下面这套 starter 结构：

```text
starter/AGENTS.md
starter/aide/AGENTS.md
starter/aide/**
```

安装器会把它映射到目标仓库中：

```text
starter/AGENTS.md      -> <repo>/AGENTS.md
starter/aide/AGENTS.md -> <repo>/.codex/aide/AGENTS.md
starter/aide/**        -> <repo>/.codex/aide/**
```

这样做是为了让根目录尽量保持轻量，同时把 Codex Aide 的工作流文件集中在 `.codex/aide/` 下。

<h2 id="built-for-codex">🧭 适用于 Codex</h2>

`codex-aide` 是给 Codex 仓库工作流准备的，重点之一就是提供一套受治理的工作流结构。它不是独立 GUI 产品，也不是通用 prompt 包。

要让安装后的工作流真正发挥作用，最好通过下面这类客户端使用仓库：

- Codex CLI
- 能读取仓库说明文件，并实际使用这套已安装目录的兼容客户端

如果客户端不读取仓库说明，或者根本不会使用安装后的这套目录，那 `codex-aide` 的效果就会很有限。

如果 Codex 本来就是你在仓库里的默认工作方式，`codex-aide` 的作用就是把这套流程固定下来，而不是另外再造一套。

### 与其他 skill 的兼容

`codex-aide` 可以和其他已安装 skill 共存。它会把自己的工作流文件、状态和仓库级结构集中留在 `.codex/aide/` 下，所以默认情况下，共存本身没有问题。

一般来说，下面这些情况比较适合：

- 你希望 Codex 相关工作有一套更清楚的仓库结构
- 其他 skill 可以共存，但不会成为 `codex-aide` 文件和决策的默认 owner
- 你希望得到一套可安装、可重复刷新的工作流基线，而不是每次手工重搭

下面这些情况通常就不太适合：

- 客户端不会读取仓库说明，也不会实际使用安装后的这套目录
- 还有另一套系统也想成为同一批 route、state、governance 决策的仓库级默认权威
- 你希望另一个 skill 默认接管 `.codex/aide/**` 这套文件树
- 你只是想要一小段 prompt，而不是一套真正安装进仓库的工作流

<h2 id="repository-docs">📚 文档</h2>

- [English](../README.md)
- [安装说明](../INSTALL.md)
- [贡献指南](CONTRIBUTING.zh-CN.md)
- [测试说明](TESTING.zh-CN.md)
- [安全策略](SECURITY.zh-CN.md)
- [支持说明](SUPPORT.zh-CN.md)
- [行为准则](CODE_OF_CONDUCT.zh-CN.md)

这个项目的一些仓库结构思路，参考了社区中的一些实践，其中包括 [agents-zone-skillset](https://github.com/lipingtababa/agents-zone-skillset)。

## 🛠 仓库维护

如果你维护的是这个仓库本身，请直接从 Git 仓库工作，并在仓库目录里运行下面这些命令。

```bash
git clone https://github.com/icellus/codex-aide.git
cd codex-aide
node scripts/validate-codex-aide-dev.mjs full
npm pack --dry-run
```

## 许可证

MIT
