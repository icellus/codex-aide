# Record: discussion sync intent

Updated: 2026-03-29 16:22 Asia/Shanghai

## 任务

把 `discussion/` 机制从“约定一个固定命令”收紧为“识别用户的同步意图”，同时保留轻量结构。

## 做了什么

- 把根目录 `AGENTS.md` 补成显式规则：`discussion/` 是本仓库的跨会话上下文机制
- 明确 `同步disc` 只是常用简称，不是唯一触发词
- 明确 semantically equivalent 的自然语言、口语化表达、混合中英说法都可以触发同步
- 明确同一个同步意图同时覆盖两类动作：
  新会话恢复上下文
  收尾时写入 history 并刷新 current
- 把这套偏好写进 `discussion/prefs.md`
- 把当前态引用更新到本条历史

## 关键决策

- 不强迫用户记忆固定命令
- 优先按语义识别，而不是按字面匹配
- `discussion/*` 继续只做轻量上下文，不扩成复杂系统
- `discussion/*` 默认不进入仓库测试范围

## 触发示例

- `同步disc`
- `同步 discussion`
- `续一下上次`
- `接着上轮继续`
- `把这次进展记进去`
- `记一下这次留给下次`

## 相关文件

- `AGENTS.md`
- `discussion/prefs.md`
- `discussion/current.md`

## 验证

- 未跑测试；本次按用户要求仅做静态落地，不对 `discussion` 机制补测试
- 已人工复核：新会话可依赖根目录 `AGENTS.md` 识别同步意图，不再要求先记住固定命令

## 下一步

- 后续继续按真实日志驱动 `codex-starter` 优化
- 每次需要留痕时，继续按 `YYYY-MM-DD-HHMM-<slug>.md` 追加新的 history
