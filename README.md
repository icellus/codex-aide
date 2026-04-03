<p align="center">
  <img src="https://raw.githubusercontent.com/icellus/codex-aide/master/docs/assets/codex-aide-hero.svg" alt="codex-aide hero" width="960" />
</p>

<h1 align="center">codex-aide</h1>

<p align="center">
  <strong>Add a governed, Codex-ready runtime to an existing repository.</strong>
</p>

<p align="center">
  For repositories you already use with <strong>Codex</strong>. If you work through <strong>Codex CLI</strong> or another compatible client, codex-aide fits into that workflow and gives it a more governed shape.
</p>

<table align="center">
  <tr>
    <td align="center"><a href="#quick-start"><strong>Quick Start</strong></a></td>
    <td align="center"><a href="#installation"><strong>Installation</strong></a></td>
    <td align="center"><a href="#built-for-codex"><strong>Built for Codex</strong></a></td>
    <td align="center"><a href="#repository-docs"><strong>Docs</strong></a></td>
    <td align="center"><a href="https://github.com/icellus/codex-aide/blob/master/docs/README.zh-CN.md"><strong>中文介绍</strong></a></td>
  </tr>
</table>

## ✨ Why codex-aide

Many Codex setups begin as a mix of prompts, local notes, and copied rules. That can work for a while, but it is hard to keep consistent across repositories and sessions.

codex-aide packages that into a repository runtime with:

- a stable entry point at the repository root
- a dedicated runtime directory under `.codex/aide/`
- a governed layout that is easier to review and refresh
- durable state for ongoing work and workflow tracking
- an install path you can run again as the starter evolves

| Without codex-aide | With codex-aide |
| --- | --- |
| Root instructions keep growing | Runtime files stay grouped under `.codex/aide/` |
| Repo setup drifts from one project to another | One starter layout can be installed again |
| Long-running work loses local workflow state | Runtime state stays with the repository |
| Workflow and validation flow depend on local habit | The starter ships a consistent, governed workflow baseline |

<h2 id="quick-start">🚀 Quick Start</h2>

Requirements:

- Node.js `>=20` for npm installation
- A repository you use through Codex CLI or a Codex-capable client

Choose one installation path below.

<h2 id="installation">📦 Installation</h2>

<table>
  <tr>
    <td align="center" width="33%">
      <strong>📦 npm install</strong><br />
      Fastest standard path
    </td>
    <td align="center" width="33%">
      <strong>🌐 git install</strong><br />
      Pull the starter and copy it directly
    </td>
    <td align="center" width="33%">
      <strong>🤖 AI install</strong><br />
      Let your coding agent do the setup
    </td>
  </tr>
</table>

### 1. npm

Use this when Node.js is available.

```bash
npm i -g @icellus/codex-aide
cd /path/to/your/repo
code-aide install
```

Optional:

```bash
code-aide install --target /path/to/repo
code-aide install --dry-run
```

### 2. Install from git

Use this when you want to pull the starter and copy it into the repository yourself.

```bash
git clone --depth 1 https://github.com/icellus/codex-aide.git /tmp/codex-aide
cd /tmp/codex-aide

cp starter/AGENTS.md /path/to/repo/AGENTS.md
mkdir -p /path/to/repo/.codex
cp -R starter/aide /path/to/repo/.codex/aide
```

This uses the same starter layout, but it does not apply the installer's merge and preservation behavior automatically.

### 3. Install with AI

Use this when you want a coding agent to do the setup in the current repository.

Give your agent this instruction:

```text
Follow https://raw.githubusercontent.com/icellus/codex-aide/master/INSTALL.md to install codex-aide into the current repository.
```

The install guide lives in [INSTALL.md](https://github.com/icellus/codex-aide/blob/master/INSTALL.md).

<h2 id="what-gets-installed">🧱 What Gets Installed</h2>

The package ships this starter layout:

```text
starter/AGENTS.md
starter/aide/AGENTS.md
starter/aide/**
```

The installer maps it into the target repository like this:

```text
starter/AGENTS.md      -> <repo>/AGENTS.md
starter/aide/AGENTS.md -> <repo>/.codex/aide/AGENTS.md
starter/aide/**        -> <repo>/.codex/aide/**
```

The goal is to keep the repository root light while keeping codex-aide runtime files together under `.codex/aide/`.

<h2 id="built-for-codex">🧭 Built for Codex</h2>

codex-aide is for Codex-based repository workflows that want a governed runtime shape. It is not a standalone GUI product and it is not a generic prompt pack.

To get value from the installed runtime, work from:

- Codex CLI
- another client that reads repository instructions and works against the installed runtime files

If Codex is already part of how you work in the repository, codex-aide is meant to tighten that workflow, not replace it with a separate product.

If the client ignores repository instructions or never touches the installed runtime tree, codex-aide will not behave as intended.

### Compatibility

codex-aide can live alongside other installed skills. Its runtime files, workflow state, and repository-level structure stay grouped under `.codex/aide/`, so coexistence is fine by default.

In practice, this is a good fit when:

- you want Codex work to follow a clearer repository structure
- other skills can coexist without becoming the default owners of `codex-aide` files and decisions
- you want one installable workflow baseline instead of repeating setup by hand

This is usually not a good fit when:

- the client ignores repository instructions or installed runtime files
- another system also wants to become the repository-level default authority for the same route, state, or governance decisions
- another skill is expected to take over `.codex/aide/**` as its own default write surface
- you only want a lightweight prompt snippet rather than an installed repository workflow

<h2 id="repository-docs">📚 Repository Docs</h2>

- [Chinese introduction](https://github.com/icellus/codex-aide/blob/master/docs/README.zh-CN.md)
- [Install guide](https://github.com/icellus/codex-aide/blob/master/INSTALL.md)
- [Contributing](https://github.com/icellus/codex-aide/blob/master/CONTRIBUTING.md)
- [Testing](https://github.com/icellus/codex-aide/blob/master/TESTING.md)
- [Security](https://github.com/icellus/codex-aide/blob/master/SECURITY.md)
- [Support](https://github.com/icellus/codex-aide/blob/master/SUPPORT.md)
- [Code of Conduct](https://github.com/icellus/codex-aide/blob/master/CODE_OF_CONDUCT.md)

Some repository-structure ideas here were informed by community work, including [agents-zone-skillset](https://github.com/lipingtababa/agents-zone-skillset).

## 🛠 For Maintainers

If you are maintaining this repository itself, start from a git checkout of `codex-aide` and run the repository checks there.

```bash
git clone https://github.com/icellus/codex-aide.git
cd codex-aide
node scripts/validate-codex-aide-dev.mjs full
npm pack --dry-run
```

## License

MIT
