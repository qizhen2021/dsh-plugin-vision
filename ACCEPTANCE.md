# 验收记录 — dsh-plugin-vision v1（任务书 §8.2）

执行日期：2026-08-14（本机 macOS，DSH `dsh web`，opencode-go 网关）
执行方式：`test/verify.sh`（静态 + 通道级，74 项断言）+ 会话内真实 `see` 工具调用（动态插件 visn-1/pkg-2，与包实现同构；profile bundle 已安装、重启后常驻）。

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 全通道：英文文本图 `/tmp/vision_test.png` → OCR 逐字正确、ASCII 有图、VLM 描述合理 | ✅ PASS | 会话内 `see` 实测：OCR `Hello Vision Test` / `Order ID: 12345` / `Total: $99.50` 逐字（ASCII 冒号正确）；ASCII 三行字形清晰；VLM 引述全部三条字符串并注明与 ground truth 一致 |
| 2 | 中文 UI `/tmp/ui_cn.png` → OCR 中文全对（11 项）、VLM 字符串与真值逐字一致、布局描述准确 | ✅ PASS | OCR 11/11 逐字（数据监控中心/首页/报表/用户管理/今日订单/1,284/活跃用户/3,672/查看详情/警告：存储空间剩余 8%/磁盘使用率 42%）；VLM 5/5 逐字引用；布局描述准确（顶栏+侧边栏+双卡片+警告横幅+进度条，进度条 42% 蓝色填充） |
| 3 | 图表读数 `/tmp/chart.png` → 数值 120/185/95/240、轴标签全对 | ✅ PASS（含已记录偏差） | OCR：4 个数值 + Y 轴刻度 50/100/150/200/250 全对；VLM：`Q1`-`Q4` 全部读出 + 数值 + `数据来源：销售系统`（并主动指出 OCR 的 `数据来源？` 误读）。**偏差 1**：OCR 对单个 `Q1` 标签偶发漏识（Vision 固有盲点，correction/语言表多种配置实测均如此），由 VLM 通道从图像直接补全 |
| 4 | 错误路径：不存在文件 → isError 可读；非图片 → NOT_AN_IMAGE | ✅ PASS | 会话内实测：`cannot read "/tmp/definitely-missing-image.png": not found`；`cannot analyze "/tmp/not-an-image.png": the .png extension declares image/png, but the bytes use a different image format`（包实现为 `FsError{FS_NOT_FOUND}` / `VisionError{NOT_AN_IMAGE}` 结构化错误） |
| 5 | 通道降级：`ocr:true, ascii:false, vlm:false` → 只返回 OCR；VLM 全部模型不可用 → `vlm.ok:false` + 可读错误 | ✅ PASS | 会话内实测：只渲染 OCR 段，无崩溃；网关指向不可达地址实测三模型全部 `Connection error` 聚合为 91 字符错误（≤300），其余通道不受影响 |
| 6 | 并发：同会话同时发两个 `see`（不同图片）→ 都成功 | ✅ PASS | 同一批次并行发送 `see(ui_cn, ocr-only)` + `see(chart, ascii-only)`，两者均成功；`isConcurrencySafe: () => true`；通道级 `Promise.all` 2×OCR+2×ASCII 并发单测亦过 |
| 7 | 取消：中途取消 → 子进程终止、无悬挂进程 | ✅ PASS（单元级） | AbortSignal 中断实测：`runOcr` 返回 `cancelled` 错误；`verify.sh` 孤儿扫描 `pgrep ocr.swift/ascii.py/prep.py/dims.py` = 0。实现：所有子进程透传 `exec.signal`（SIGKILL 进程树）+ 每通道超时 SIGTERM→SIGKILL + 工具级 `timeoutMs: 240000`；真实会话内取消由用户在 GUI 触发、走同一 signal 路径 |
| 8 | 密钥安全：源码树/日志零密钥 | ✅ PASS | 密钥**值**：源码树 0 文件、运行日志（acceptance.log/unit.log）0 文件；密钥**名**仅出现在合法位（credentials.ts/vlm.mjs 读取处、index.ts 配置默认、README 配置表、测试脚本），执行路径零命中。密钥经 `ctx.credentials` 服务读取，动态桥经 stdin 传给子进程（不进 argv/env，`ps` 不可见） |

## 单测基线

`node test/unit.mjs`：**74 passed, 0 failed**（通道级 + mock-ctx 工具级，含真实网关 VLM 调用、>8MB 大图 `FS_TOO_LARGE` 分支、1ms 超时、60ms 中断、并发、schema/render/presentationMeta 断言）。连续两轮 74/74 稳定。

## 已知偏差（如实记录）

1. **OCR 的 `Q1` 盲点**（第 3 项）：`usesLanguageCorrection` 开关、固定语言表与自动语言检测三种配置下 Vision 均漏识图表左下角单个 `Q1` 标签（同尺寸的 Q2/Q3/Q4 正常）。工具级读数不受影响：VLM 通道直接从图像读出 Q1-Q4。缓解方案留待 v2（如 `minimumTextHeight` 扫描或双次 OCR 合并）。
2. **`ocr.swift` 语言配置调整**（相对任务书 §7）：由固定 `["zh-Hans","en-US"]` 改为 `automaticallyDetectsLanguage = true`（macOS 13+，旧系统回退固定表）。实测依据：混排英文图 `Total: $99.50` 的 ASCII 冒号在固定语言表下被读成全角 `：`，自动检测下逐字正确；中文 11 项逐字不受影响。`usesLanguageCorrection = true` 保留。
3. **`readBytes` 硬上限语义**（实现修正，非偏差）：`ctx.fs.readBytes` 的 `maxBytes` 是硬上限（超限抛 `FS_TOO_LARGE`，不截断）。魔数校验对 ≤8MB 文件执行，>8MB 跳过魔数、由 dims 探针（PIL 解码）权威校验（新增回归测试覆盖）。

## 接入状态

- 动态插件 `visn-1/pkg-2`（本会话 GUI 插件入口）：运行中，`see` 已注册、模型可见（Tool.listTools 首位）。
- profile bundle：`~/.dsh/profiles/web/package.json`（备份 `.bak-20260814-*`）已追加 `@deepseek-ai/dsh-plugin-vision`（`file:vendor/dsh-plugin-vision` 软链），`pnpm install` 完成、包从 profile 上下文加载验证通过（`name: dsh-plugin-vision`, `inject: [tools,fs,systemPrompt]`）。**下次 `dsh web` 重启后常驻所有会话**（本会话进程不重启以免中断）。
- GUI 插件清单页查证结论：`dsh-host-plugin-inventory` 为只读投影（"No provenance or mutation"），不支持本地插件安装 → 采用任务书 §8.1 备选路径。
