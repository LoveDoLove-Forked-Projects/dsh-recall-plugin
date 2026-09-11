# docs 目录索引与文档规范

> 新增任何文档前先读本文件：按规则放置与命名，避免目录结构随文档增多而失控；移动、重命名或删除文件时，同步修订本目录树与所有入站链接。

本目录是项目文档的归口，归类只看完成语义：**计划是「要做的事」，有完成态，进 `plans/`（状态即目录）；事实是「一直成立的事」，无完成态，放根目录或版本快照目录。** 计划完成后移入 `completed/` 原地保留实施与验收记录，不删除；事实文档随 dsh 升级与实现变更原地维护。

## 目录布局

树覆盖现存全部文档与素材；新增或移动文件时同步修订本树。

```
docs/
├── README.md              # 本文件：目录索引与文档规范
├── dsh-contract.md        # DSH 契约文档：插件依赖面详细契约 + 未依赖面全量清单（dsh 升级核查底稿）
├── compat-audit.md        # 契约台账：官方 API 耦合点「子系统 × 不变量 × 探针」矩阵（dsh 升级后定点复查）
├── dsh-contract-verify.md # 契约可用性二次验证记录（基准 2026-08-31 / dsh 0.1.2-alpha.2；候选落地状态随实施标记）
├── design-tokens.md       # 设计令牌与官方组件配方参考（client UI 改样式先查）
├── routing-interplay.md   # 与 dsh-routing-suite 的交互说明（撤回 × 路由阶段，事实文档）
├── reference/             # 官方文档本地镜像（随仓库提交，只读不改；索引与重拉方式见 reference/README.md）
├── plans/                 # 计划文档族（状态即目录：pending/ 待办，completed/ 已完成）
│   ├── improvement-plan.md              # 总索引（单一事实源：计划清单、状态与全局顺序）
│   ├── research-competitors.md          # 竞品调研第一/二轮（2026-08-26/28，静态归档，不参与状态分目录）
│   ├── research-competitors-2026-09.md  # 竞品六维度评估第四轮（2026-09-09，三竞品新版本，增量输入 plan-competitor-ux）
│   ├── pending/                         # 待实施 / 实施中
│   │   ├── plan-competitor-ux.md    # 第三轮竞品改进：交互补强与可靠性钉子（S1 已随 settings-ui 完成，其余待实施）
│   │   ├── plan-p2.md               # P2 打磨项（按需挑选；P2-4/P2-5 已完成）
│   │   └── plan-settings-ui.md      # 设置页 UI 优化 V1–V9（2026-09-04 全量实施，剩真实窄视口/键盘/读屏 3 项人工复核）
│   └── completed/                       # 已实施（原地保留实施记录与验收依据，完成不删除）
│       ├── plan-p0.md                   # P0 安全洞堵补（已实施，待发版）
│       ├── plan-p1.md                   # P1 工程补课
│       ├── plan-settings-ux.md          # 设置页体验优化
│       ├── plan-competitor-improvements.md  # 竞品改进：健壮性补强与结构拆分
│       ├── plan-competitor-fixes.md         # 竞品改进实施审查修复
│       ├── plan-env-diagnostics.md          # 环境错误主动诊断（issue #11）
│       ├── plan-performance.md              # 性能优化（PF-1〜PF-9，2026-08-29 实施 + 实弹通过）
│       ├── plan-ts-refactor.md              # TS 迁移总计划（JS → TypeScript，计划修订至 v3.2；M1–M8 已实施，2026-09-01 归档）
│       ├── plan-ts-refactor-m1..m8.md       # 同上的 8 份阶段实施文档（随总计划归档）
│       ├── smoke-checklist.md               # 冒烟测试待办清单（七节全部通过，2026-08-29）
│       └── smoke-checklist-records.md       # 冒烟测试执行记录（随清单归档）
├── upgrade-assessments/   # dsh 版本升级影响评估（版本快照，随版本归档，无完成态流转）
│   ├── dsh-0.1.3-alpha.1.md    # 0.1.3-alpha.1 影响评估（2026-09-04，契约零破坏 / 行为级影响）
│   ├── dsh-0.1.3-alpha.2.md    # 0.1.3-alpha.2 影响评估（2026-09-08，门禁实跑全绿 / 性能回退已修复）
│   ├── dsh-0.1.5-alpha.1.md    # 0.1.5-alpha.1 影响评估（2026-09-09，接口零破坏 / 会话格式 V3 天然免疫）
│   ├── dsh-0.1.5-alpha.2.md    # 0.1.5-alpha.2 影响评估（2026-09-10，依赖面源码零 diff / 面板槽位迁移零交集）
│   ├── dsh-0.1.5-rc.1.md       # 0.1.5-rc.1 影响评估（2026-09-10，纯发布层推进 / 零破坏零回归）
│   └── dsh-0.1.5-rc.2.md       # 0.1.5-rc.2 影响评估（2026-09-11，消费面唯一命中为 ui-chat CSS / 零破坏）
└── screenshots/           # README 与文档引用的截图素材（只增不删；必删时同步 README 双语与全部文档引用）
```

## 归类规则

按完成语义与用途对号入座；「现有示例」列是可直接对照的样板。

| 文档类型 | 放置位置 | 命名规范 | 现有示例 |
|---|---|---|---|
| 总路线图 / 改进计划 | `plans/` | `<主题>-plan.md` | `improvement-plan.md` |
| 分期 / 专题实施计划（待办） | `plans/pending/` | `plan-<期次或主题>.md` | `pending/plan-p2.md`、`pending/plan-competitor-ux.md` |
| 分期 / 专题实施计划（已完成） | `plans/completed/` | 同上，**文件名不变**（代码注释与台账按文件名引用） | `completed/plan-p1.md` |
| 冒烟 / 回归验证清单 | `plans/pending/`，全部执行完移入 `completed/` | `smoke-<范围>.md` | `completed/smoke-checklist.md` |
| 调研报告 | `plans/`（与衍生计划放一起，积累多了再拆 `research/`） | `research-<主题>.md`；同主题多轮加 `-YYYY-MM` 后缀 | `research-competitors.md`、`research-competitors-2026-09.md` |
| 长期事实文档（契约、台账、验证记录、设计令牌、交互说明等） | `docs/` 根 | 小写 kebab-case，不带 plan 与日期 | `dsh-contract.md`、`compat-audit.md`、`dsh-contract-verify.md`、`design-tokens.md`、`routing-interplay.md`；规划中 `format.md`、`security.md`（见 `pending/plan-p2.md` P2-2） |
| dsh 版本升级影响评估 | `upgrade-assessments/` | `dsh-<版本号>.md`（版本快照，无完成态，不进 plans 状态目录；每 dsh 版本一份） | `dsh-0.1.5-rc.1.md` |
| 官方文档本地镜像 | `reference/` | 保留官方编号文件名（01〜13 + README），随仓库提交 | `reference/README.md` |

## 生命周期约定

以下约定覆盖计划族的全生命周期，以及与事实文档、版本快照的边界（第 6 条）。

1. **状态字段**：计划文档头部引用块统一带 `状态：待实施 / 实施中 / 已完成 / 已废弃`；分期计划另带 `上游文档` 链接。目录位置是状态的一级表达，头部状态字段保留为精确表达（如 `plan-p0` 的「已实施（待发版）」）。
2. **状态即目录，完成不删除**：待办放 `pending/`，完成后移入 `completed/`——验收记录与「为什么做/为什么不做」的决策依据是后续维护的一手材料；只有内容完全过时且无参考价值时才删。移动时必须同步三处：总索引（improvement-plan.md）链接、文内相对链接（子目录深一层，代码链接 `../../` → `../../../`）、上游文档的反向引用。
3. **子计划回链**：新分期/专题计划从总计划拆出后，必须在总计划（improvement-plan.md）相应章节挂上链接，保持单一事实源可导航。
4. **相对链接**：`plans/` 根文档指向代码用 `../../src/...`；`pending/`、`completed/` 内文档深一层，用 `../../../src/...`。`lib/` 是构建产物目录，文档指向代码一律用 `src/` 路径；文档互链用相对路径（同目录 `./xxx.md`，跨状态目录 `../` 或 `./completed/` 前缀）。
5. **不预写发版版本号**：计划文档不预先指定具体发版版本号（patch/minor 语义可以写）；版本号在发版流程中确定（见 AGENTS.md 发布流程），避免计划与实际发版节奏漂移。
6. **事实文档原地维护，历史记录不改写**：根目录事实文档随 dsh 升级与实现变更原地更新。历史记录按当时原文冻结、不改写：`completed/` 计划与冒烟记录、`upgrade-assessments/`（按 dsh 版本追加，不移动）、`research-competitors*.md`（调研归档，新轮次新建文件）——不改其措辞，也不追改其中的代码路径与外链（目录或扩展名迁移后失效的链接保持原样）；对它们的索引与入站链接照常维护。

## 新增计划文档 checklist

拆新计划与归档收尾时逐项核对：

- [ ] 放 `docs/plans/pending/`，按命名规范起名（验证清单用 `smoke-<范围>.md`）
- [ ] 头部引用块：状态 + （分期计划）上游文档链接
- [ ] 总计划对应章节挂新文档链接
- [ ] 指向代码的相对链接用 `../../../` 前缀（pending/completed 子目录内）
- [ ] 内容含：目标 / 任务分解 / 改动落点 / 验收标准 / 风险与回退（参照现有 plan-*.md 的结构）
- [ ] 完成后移入 `completed/`，并按生命周期约定第 2 条同步三处链接
