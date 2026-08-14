# @qizhen2021/dsh-plugin-vision

给纯文本模型一双"眼睛"。注册一个 `see` 工具：对任意图片输出**纯文本**的三通道分析——

| 通道 | 实现 | 输出 |
|---|---|---|
| OCR（离线） | macOS Vision（`swift`，自动语言检测，中文/英文逐字） | `x y w h\|text`，坐标为归一化百分比 ×100，**y 原点在左下**，已按行排序 |
| ASCII 布局图 | PIL 灰度（`python3`），88 列，`' .:-=+*#%@'` 梯度（`' '` 最暗 → `'@'` 最亮） | 单色字符画，纯文本模型可直接"看"布局 |
| 语义描述 | **mimo-v2.5**（默认）经 opencode-go 网关（`https://opencode.ai/zen/go/v1`），Node openai SDK | TEXT/LAYOUT/UI/STYLE/NOTES 结构化报告，OCR ground truth 注入保证字符串逐字准确 |

**与 `read_image` 的本质区别**：`read_image` 要求路由模型声明 image 输入，纯文本模型直接被拒；`see` 的结果是纯文本，**任何模型（包括 deepseek-v4-flash 这类纯文本模型）都能调用**。

## 安装（profile bundle 方式）

> 查证结论：GUI 的插件清单页（`@deepseek-ai/dsh-client-ui-settings-plugin-inventory` / `dsh-host-plugin-inventory`）是**只读**投影，不支持本地插件安装（"No provenance or mutation"）。因此按任务书 §8.1 采用备选：profile bundles。改动在下一次 `dsh web` 重启时生效。

仓库已提交构建产物 `lib/`（含资源文件），依赖（`@deepseek-ai/dsh-tools` 等）均在 npm 公开注册表，**无需本地编译**即可部署。三种方式任选：

### 方式 A：npm 安装（推荐，最省事）

```bash
cd ~/.dsh/profiles/web && pnpm add @qizhen2021/dsh-plugin-vision
```

然后在 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 数组追加一行：

```jsonc
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@qizhen2021/dsh-plugin-vision"   // ← 追加这一行
      ]
    }
  }
}
```

重启 `dsh web` 后，`see` 出现在所有会话的工具列表。

### 方式 B：git 依赖（不装 npm 包，直接跟仓库）

```jsonc
{
  "dependencies": {
    "@qizhen2021/dsh-plugin-vision": "github:qizhen2021/dsh-plugin-vision"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@qizhen2021/dsh-plugin-vision"   // ← 追加这一行
      ]
    }
  }
}
```

然后 `cd ~/.dsh/profiles/web && pnpm install`，重启 `dsh web`。

### 方式 C：clone + file: 软链（方便本地改配置/二次开发）

```bash
git clone https://github.com/qizhen2021/dsh-plugin-vision
cp ~/.dsh/profiles/web/package.json ~/.dsh/profiles/web/package.json.bak-$(date +%Y%m%d-%H%M%S)
ln -sfn "$(pwd)/dsh-plugin-vision" ~/.dsh/profiles/web/vendor/dsh-plugin-vision
# 在 ~/.dsh/profiles/web/package.json 里：
#   dependencies 加  "@qizhen2021/dsh-plugin-vision": "file:vendor/dsh-plugin-vision"
#   dsh.profile.bundles 追加 "@qizhen2021/dsh-plugin-vision"
cd ~/.dsh/profiles/web && pnpm install   # 重启 dsh web 生效
```

### 方式 D：其他 DSH 组合（非 web profile）

包根只导出 Cordis 插件契约（`name` / `inject` / `Config` / `apply`），可像 `@deepseek-ai/dsh-tool-fs` 一样挂进任意 composition / agent preset：`inject: ["tools", "fs", "systemPrompt"]`，加载器会按 `Config` schema 注入配置。

默认配置零改动即可用；覆盖默认值（如换默认视觉模型）时用 `~/.dsh/profiles/web/cordis.patch.yml`：

```yaml
- id: dsh-plugin-vision
  config:
    defaultModel: qwen3.6-plus
```

## 配置（全部可选）

| 键 | 默认 | 含义 |
|---|---|---|
| `defaultModel` | `mimo-v2.5` | 默认视觉模型（0.14/0.28 每 1M token，与 flash 同价） |
| `fallbackModels` | `["qwen3.6-plus", "kimi-k3"]` | 兜底链，逐个尝试 |
| `gatewayBaseUrl` | `https://opencode.ai/zen/go/v1` | OpenAI 兼容网关 |
| `credentialPath` | `~/.dsh/.credentials.yaml` | 密钥文档（仅当 credentials 服务未挂载时直读） |
| `credentialKeys` | `["OPENCODE_GO_API_KEY", "OPENCODE_API_KEY"]` | 候选密钥名，按序尝试 |
| `maxImageSide` | `1600` | VLM 预处理最长边（`SEE_MAX_SIDE` 传给 prep.py） |
| `asciiWidth` | `88` | ASCII 布局图列数（`SEE_ASCII_WIDTH` 传给 ascii.py） |
| `vlmMaxTokens` | `1200` | VLM 最大输出 token |
| `vlmMaxChars` | `4000` | `vlm.text` 截断长度 |
| `ocrTimeoutMs` | `90000` | swift 首调含编译，超时给足 |
| `asciiTimeoutMs` | `30000` | ascii/prep/dims 超时 |
| `vlmTimeoutMs` | `120000` | 网关调用总超时（prep 另计 ≤30s） |

密钥读取双层策略：优先 `ctx.credentials` 服务（热重载、0600 权限约束）；服务未挂载时回退到 `credentialPath` 的 YAML 直读（`yaml` 包）。密钥**不进代码、不进日志、不进 schema、不进 presentationMeta**。

## GUI 配置（设置 → 通用 → 视觉模型）

v0.2.0 起插件在 `ctx.settings` 注册命名空间 `dsh-plugin-vision`（schema：`defaultModel`，`applies: 'live'`）：

- **GUI**：设置 → 通用页出现「视觉模型」下拉行（由轻量设置桥渲染，本机 loopback 可用），选择立即生效并持久化；
- **持久层**：用户选择写入 settings 存储（`~/.dsh/settings.yaml` 的 `dsh-plugin-vision` 段），跨重启保留；也可手工编辑该文件；
- **优先级**：settings 用户层 > composition base（loader 配置，如 `cordis.patch.yml` 的 `defaultModel`）> schema 默认（`mimo-v2.5`）；
- **运行时**：Host 端 `watch` 设置变更，工具无需重启即用新默认值；单次调用仍可用 `see` 的 `model` 参数覆盖。

## 工具

### `see`

- 参数（snake_case）：`file_path`（必填，经 `ctx.fs.resolve` 相对会话 cwd 解析，透传 `exec.signal`）、`ocr?`/`ascii?`/`vlm?`（默认均 true）、`model?`（默认 `defaultModel`）。
- canonical value：`{ path, image: {width,height}, channels: { ocr: {enabled,ok,error,items[]}, ascii: {enabled,ok,error,art}, vlm: {enabled,ok,error,model,text} } }`，`additionalProperties: false`，全字段 required。
- 单通道失败**不**整体失败：该通道 `ok:false` + `error`（≤300 字符，可读；Python traceback 折叠为最后一行异常）。
- 整体错误（`isError`）：文件缺失/非普通文件沿用 `FsError`（`{name:"FsError", code:"FS_NOT_FOUND"/"FS_NOT_REGULAR_FILE"}`）；非图片/魔数不符/参数非法抛 `VisionError extends HarnessError`（`{name:"VisionError", code:"NOT_AN_IMAGE"/"INVALID_ARGS"}`）。
- `render`：markdown 报告（`# 视觉分析` / `## OCR` / `## ASCII 布局图` / `## 语义描述`）；`presentationMeta`：可回放摘要（path + 各通道 ok 摘要，无密钥）。
- `isConcurrencySafe: () => true`（只读工具，子进程互相隔离）；`timeoutMs: 240000`（协作式总预算，所有子进程透传 `exec.signal`，abort 即杀子进程）。

### 系统提示

```
Use the see tool — not read_image — to analyze images when the routed model is text-only: it returns OCR text with positions, ASCII layout, and a vision-model description. Call it with the image file_path.
```

## 已验证的环境事实（写死进实现）

- 网关 `https://opencode.ai/zen/go/v1`（OpenAI 兼容 `/chat/completions`）；Python 直连被 Cloudflare 指纹拦截（HTTP 403, error 1010），**只走 Node openai SDK**。
- v1 只用 openai-completions 协议模型：mimo-v2.5 / qwen3.6-plus / kimi-k3。
- kimi 系列可能只回 `reasoning_content`，content 为空时回退取值；仍空视为该模型失败，继续兜底链；全失败 → `vlm.ok:false` + 聚合错误（每条 ≤120 字符）。
- OCR ground truth 注入 VLM prompt（`[OCR ground truth — trust it for exact strings]`），实测是中文/数字逐字准确的关键。
- 大图先经 prep.py 缩到最长边 ≤1600、JPEG q88，防网关/内存问题。

## 验收

`bash test/verify.sh` 生成 `/tmp/ui_cn.png`、`/tmp/chart.png`、`/tmp/vision_test.png`，跑 74 项通道/工具级断言（含真实网关 VLM 调用、取消/超时/并发、>8MB 大图、密钥扫描、孤儿进程扫描），逐项记录到 `test/acceptance.log`。需要真实模型调用的两项（工具列表可见性、同会话并发 `see`）由执行代理在会话内实测并记录于 `ACCEPTANCE.md`。

**与任务书 §8.2 的两处已知偏差（实测记录）**：
1. OCR 对图表左下角单个 `Q1` 标签偶发漏识（Vision 固有盲点，多种配置实测均如此）——VLM 通道从图像直接读出 Q1-Q4 与全部数值，工具级读数完整；详见 `ACCEPTANCE.md`。
2. `ocr.swift` 由固定 `["zh-Hans","en-US"]` 改为 `automaticallyDetectsLanguage = true`：混排文档的逐字精度实测更优（如 `Total: $99.50` 的 ASCII 冒号在固定语言表下被读成全角 `：`），中文 11 项逐字不变。

## 已知限制

- **无截图模式**：`screencapture` 无屏幕录制权限（"could not create image from display"），v1 不做。
- **OCR 仅 macOS**（Vision 框架）；ASCII/prep/VLM 跨平台（python3 + PIL）。
- swift 首调含编译约 1–2 秒（超时 90s 已留足）；v1 不做预编译缓存。
- 通道超时与取消依赖子进程协同；网关 HTTP 请求经 AbortSignal 中断。

## 包结构

```
src/index.ts        # { name, inject, Config, apply }（对齐 dsh-tool-fs）
src/see.ts          # defineTool：schema / render / presentationMeta / execute 编排
src/ocr.ts          # swift Vision OCR 子进程封装
src/ascii.ts        # python3 ASCII 布局图封装
src/dims.ts         # sips → PIL 图像尺寸/可解码性探针
src/vlm.ts          # openai SDK 调用 + 兜底链 + ground-truth 注入
src/credentials.ts  # credentials 服务 → YAML 回退（只读、不打印）
src/run-script.ts   # 共享子进程运行器（signal + 超时 SIGTERM→SIGKILL）
src/resources/      # ocr.swift / ascii.py / prep.py / dims.py（import.meta.url 定位）
test/               # gen_test_images.py / unit.mjs（74 断言）/ verify.sh
dyn/vlm.mjs         # 仅限会话内动态插件验证桥（不随 npm 包发布）
```
