# 检索探针

面向[分类法](../SKILL.md#分类)的探针。每个命中都需要语义判断——探针按设计会过度匹配，也天然会欠匹配：每一轮审查都找到过没有探针能抓到的案例，所以要配合一遍不带模式的密集散文阅读。

## 调用规则

- 加 `--hidden --glob '!.git/**'` 以便搜到 `.agents/`；ripgrep 默认跳过点目录，而历史清理最大的漏检风险就在技能与计划记录里。
- 排除项放在最后，避免被后续 include 重新纳入：

  ```sh
  --glob '!docs/reference/**' --glob '!lib/**' --glob '!node_modules/**' \
  --glob '!docs/plans/completed/**' --glob '!docs/upgrade-assessments/**' \
  --glob '!.agents/skills/trim-cot-leakage/**' --glob '!.codebuddy/skills/**'
  ```

  最后两项是因为本 skill 的文件本身引用泄漏措辞作校准材料；如果从 `.codebuddy/skills/`（junction）搜索，两处都要排除。`docs/screenshots/` 与构建派生物同样不是散文目标。

- 自然语言行带 `-i`，让句首大写的模式也能命中（「本 PR 新增……」「大概够了……」）；匹配代码模式的那一行保持大小写敏感，`-i` 会把 `\bT\d\b` 之类的模式变成噪声。
- 界定完整短语。`\bthis PR\b` 要匹配 "this PR adds"，但不能匹配 "this project"、"this process"、"this provider"。
- 零命中在能匹配一个已知正例之前不证明任何事；噪声模式在能拒绝一个近似反例之前也不证明任何事。信任语料结果前先双向校准。
- 作者语言探针瞄准对面语言的表面：在中文文档里搜英文工作片段，在英文 Markdown 与英文注释/JSDoc 里搜中文残留，在 `*.zh.md` 里搜中文变更叙述。对中文散文做通用 ASCII 搜索在代码与标识符周围噪声太大，改为把散文新增内容与对应侧比较。

## 中文电池

```sh
# 中文文档里的变更或审阅叙述。
rg -n --hidden '评审|上一?轮|旧版|老的|不再|以前|本版|遗留' ...

# 英文 Markdown 里的中文工作语言滑出。
rg -n --hidden '设计稿|评审|上一?轮|旧版|老的|不再|以前|本版|遗留|私有|(^|[^a-zA-Z])端([^a-zA-Z]|$)' --glob '*.md' --glob '!*.zh.md' ...

# 英文代码注释与 JSDoc 里的中文滑出。
rg -n --hidden '(^[[:space:]]*(//|/\*|\*)|//|/\*)[^\r\n]*(设计稿|评审|上一?轮|旧版|老的|不再|以前|本版|遗留|私有|端)' --glob '*.{ts,tsx,js,jsx,mjs,cjs,css}' ...

# 英文 README（README.en.md）里的中文残留。
rg -n --hidden '[\p{Han}]' --glob 'README.en.md' ...
```

## 英文电池

```sh
rg -n --hidden '\(decision \d|\(audit [A-Z]\d|design §|plan §|design ledger|\(B ruling|\bP-I\b|\bW\d\b|\bT\d\b' ...
rg -n --hidden -i '\bthis PR\b|\bthis branch\b|\bthis stack\b|\blater PRs?\b|\bprevious commits?\b|\bthis commit\b' ...
rg -n --hidden -i '\bused to\b|\bno longer\b|\bpreviously\b|\bthe old\b|\bwas renamed\b|\bwas moved\b' ...
rg -n --hidden -i '\bv1\b|this cut|\bcut \d|\btoday\b|\bfor now\b|roadmap' ...
rg -n --hidden -i 'rejected in review|review round|reviewer|as of v\d' ...
rg -n --hidden -i 'probably |should be enough|should suffice|it simply|is safe —|is safe --' ...
rg -n --hidden '§\d' ...
```

英文电池主要针对 `README.en.md` 与英文注释；中文文档用上面的中文电池。

## 已知误报族

已判定并保留，预期会再遇到：

- **instrumental 的「used to」**——"the key used to sign requests" 是工具性的，不是时间性的。时间性形式在它前面有一个主语状态（"colors used to come from…"）。
- **运行时新旧**——「旧连接排空后新连接才接受」指交接中的两个活对象，不是仓库状态。
- **流程文档里的「PR」**——*关于* PR 工作流的文档（提交规范、发布流程说明）说「PR」是合法的；禁令针对的是文档采用某一个 PR 对代码的视角。
- **`v1` 作为协议或路径段**——`/v1/chat` 端点和线格式名是标识符，不是版本戳。
- **有已提交拥有者的 `§N`**——外部标准（RFC 9110 §10.1.5）与拥有自己 § 编号的已提交文档可以按节引用。
- **对比性的「实际上」与名词「等待」**——普通语言，不是含糊；没有已提交的行探测它们，只有扩展更宽的含糊模式时才会冒出来。
- **运行时的「今天」与录制时间戳**——询问当前日期的提示或测试用的是自然时间，不是仓库版本戳；录制的 CLI 输出保留它的口吻。到达模型或用户的措辞仍要先满足行为证据规则才能改。
- **`本版本`**——在版本化产物语境里是 "this release" 的合法渲染；被禁的索引词是裸的 `本版`，对应 "this cut"。
- **备选方案小节**——计划记录「备选方案」体裁槽里的「被拒」是受认可的归宿，不是审阅编排。
