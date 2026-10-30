# Lumina Mac

本仓库是 [Lumina](https://github.com/lumina-tl/lumina) 的 macOS 向 fork，在上游漫画 / 条漫自动翻译流水线之上，重点加强了：

- **macOS Metal / CoreML 加速** — ONNX Runtime 走 `CoreMLExecutionProvider`（底层 Metal + Neural Engine），提供 Apple Silicon / Intel Mac 的原生打包与安装包
- **简体中文界面** — 默认 UI 语言为简体中文，可在设置中切换 English
- **免费 / 国内友好翻译 API** — 预置硅基流动、智谱 GLM、腾讯混元、OpenRouter 免费模型、Groq、Gemini 等，开箱即用

上游文档站点仍可参考：[lumina.navierr.dev](https://lumina.navierr.dev/)。与本 fork 不一致处以本仓库为准。

![Lumina main interface](showcase/screenshot.png)

## 目录

- [相对上游的改动](#相对上游的改动)
- [功能](#功能)
- [展示](#展示)
- [工作流程](#工作流程)
- [架构](#架构)
- [模型](#模型)
- [翻译](#翻译)
- [GPU 加速](#gpu-加速)
- [安装包](#安装包)
- [项目文件格式 (.lmi)](#项目文件格式-lmi)
- [开发](#开发)
- [路线图](#路线图)
- [更新日志](#更新日志)
- [许可证](#许可证)

## 相对上游的改动

| 方向 | 本 fork |
| ---- | ------- |
| 平台 | 完整 macOS 打包（`dist:macos` / arm64 & x64 DMG），运行时按 CoreML 变体解析 |
| GPU | `LUMINA_EP=coreml` / `metal`；`auto` 优先级为 CUDA → CoreML → DirectML → CPU |
| 界面语言 | 默认 `zh`（简体中文），支持 `en`；主进程原生对话框同步语言 |
| 翻译提供商 | 新增硅基流动、智谱、混元等 OpenAI 兼容预设；OpenRouter / Groq / Gemini 标注免费档模型 |
| 上游能力 | 检测 / OCR / 修复 / 排版流水线、`.lmi` 工程、Windows DML/CUDA 安装包等仍保留 |

## 功能

- **半自动流水线** — 检测、OCR、翻译、修复、排版自动跑通，每一步仍可手改：检测框可重排或修正，OCR 文本可按行编辑 / 重译，修复蒙版是独立图层，导出前可开关、移动或删除。
- **内容感知修复** — 按气泡蒙版修复，分割检测还可生成整页蒙版。
- **选择工具** — 套索与矩形；Shift 加选 / 合并，Alt 减选。
- **排版辅助** — 自动检测文字颜色与倾斜、自动适配字号、按图层排版。
- **工程保存 / 导入** — 单个 `.lmi` 文件，并注册文件关联；支持 PNG / JPG 导出与拖拽排序；PSD 导出为预览能力。
- **GPU 加速** — 可按模型查看实际执行提供方（含 Metal / CoreML）。
- **中英界面** — 设置 → 常规即可切换；默认简体中文。

## 展示

下列示例未必随主分支频繁更新，效果以当前版本为准。

<table>
  <thead>
    <tr>
      <th align="center" width="50%">原图</th>
      <th align="center" width="50%">译后 / 清理后</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center" width="50%">
        <a href="showcase/1/before.png">
          <img alt="Original" src="showcase/1/before.png" />
        </a>
        <br />
        <a href="https://x.com/rikak/status/1642727617886556160/photo/1">(Source @rikak)</a>
      </td>
      <td align="center" width="50%">
        <a href="showcase/1/after.png">
          <img alt="Translated" src="showcase/1/after.png" />
        </a>
        <br />
        <code>full pipeline</code>
      </td>
    </tr>
    <tr>
      <td align="center" width="50%">
        <a href="showcase/2/before.jpg">
          <img alt="Original" src="showcase/2/before.jpg" />
        </a>
        <br />
        <a href="https://mangadex.org/title/d313c527-5a37-411f-b82b-3ca61feca13e">(Source: MangaDex)</a>
      </td>
      <td align="center" width="50%">
        <a href="showcase/2/after.png">
          <img alt="Translated" src="showcase/2/after.png" />
        </a>
        <br />
        <code>full pipeline</code>
      </td>
    </tr>
    <tr>
      <td align="center" width="50%">
        <a href="showcase/3/before.png">
          <img alt="Original" src="showcase/3/before.png" />
        </a>
        <br />
        <a href="https://x.com/hiduki_yayoi/status/1645186427712573440/photo/2">(Source @hiduki_yayoi)</a>
      </td>
      <td align="center" width="50%">
        <a href="showcase/3/cleaned.png">
          <img alt="Cleaned" src="showcase/3/cleaned.png" />
        </a>
        <br />
        <code>inpaint only — no typesetting</code>
      </td>
    </tr>
  </tbody>
</table>

## 工作流程

```mermaid
flowchart LR
    A[检测文字] --> B[OCR]
    B --> C[翻译]
    C --> D[修复]
    D --> E[排版]
    E --> F[导出]
```

每一步都会留下可编辑结果：检测框可重排或手改，OCR 可按行编辑 / 重译，修复蒙版以图层形式保留，导出前仍可调整。

## 架构

- **Electron 壳** — `src/main/`（窗口、后端生命周期、文件 I/O）、`src/preload.ts`（隔离桥）、`src/renderer/`（UI、画布、流水线编排）。
- **Python 后端** — FastAPI，监听 `localhost:8765`，由 Electron 主进程拉起与关闭；推理与翻译都走其 HTTP API。
- **ONNX Runtime** — 模型本地以 ONNX 图运行；后端在运行时解析执行提供方（含 CoreML）。
- **统一 IPC 契约** — `src/shared/bridge.ts` 定义跨进程的通道、载荷与类型。

```
lumina/
├── src/
│   ├── main/          Electron 主进程（窗口、后端、工程、导出）
│   ├── preload.ts     上下文隔离 IPC 桥
│   ├── renderer/      UI、画布、流水线；i18n/{zh,en}.json
│   └── shared/        跨进程契约（含 translate-providers）
├── python/
│   ├── main.py        FastAPI 入口
│   ├── services/      可插拔注册表（detect / ocr / inpaint / translate）
│   └── prompts/       默认翻译指令
├── models/            本地开发用模型目录（见「模型」）
└── cache/             运行时缓存（补丁、解压工程等）
```

## 模型

在 **设置 → 模型** 中管理。安装包不内置模型；按需下载，或手动放到模型目录。

目录解析顺序：`LUMINA_MODEL_DIR` 环境变量 → 设置里保存的路径 → 平台默认 `userData/models`（macOS 约为 `~/Library/Application Support/Lumina/models`）。源码运行时可在 `.env` 里指向仓库的 `models/`（见 [.env.example](.env.example)）。

| 类别 | 模型 | 状态 | 执行 |
| ---- | ---- | ---- | ---- |
| Detect | `rtdetr` | Ready（默认） | CUDA / DirectML / CoreML / CPU |
| Detect | `rfdetr_seg` | Ready | CUDA / DirectML / CoreML / CPU |
| OCR | `manga_ocr` | Ready（默认） | CUDA / DirectML / CoreML（解码器常在 CPU） |
| OCR | `baberu` | Ready | CUDA / DirectML / CoreML（解码器常在 CPU） |
| OCR | `ppocrv6` | Ready | CUDA / DirectML / CoreML / CPU |
| OCR | `paddleocr_vl` | 开发中 | CUDA 或 CPU（无 DirectML） |
| Inpaint | `lama_manga` | Ready（默认） | CUDA / CoreML 或 CPU（无 DirectML） |
| Inpaint | `lama` | Ready | 仅 CPU |
| Aux | `anglenet` | Ready（辅助） | 强制 CPU |

「Ready」表示稳定；「开发中」可用但边角可能仍糙。

`anglenet` 约 2 MB，首次启动会后台自动下载，用于检测文字倾斜（`textAngle`）；缺失时回退到 PCA 启发式。

## 翻译

整条流水线里，**只有翻译会请求外部 AI API**；检测 / OCR / 修复 / 排版均离线。在翻译设置中选择提供商并填入 API Key；密钥除发往所选提供商外不会离开本机。

提供商列表以 `src/shared/translate-providers.ts` 与 `python/services/translate/provider/catalog.py` 为准（前后端需保持同步）。

| 提供商 | 类型 | 说明 |
| ------ | ---- | ---- |
| 自定义 | OpenAI / Anthropic 兼容 | 自填 Base URL（Ollama、LM Studio、vLLM、OpenRouter 等）；可切 Anthropic 风格 |
| OpenRouter | OpenAI 兼容预设 | 默认 DeepSeek 等；含多档 free 模型（避免对部分地区封锁的 openai/\*） |
| 硅基流动 SiliconFlow | OpenAI 兼容预设 | 国内节点；Qwen / GLM 等，含免费档 |
| 智谱 Zhipu GLM | OpenAI 兼容预设 | 默认 `glm-4-flash` 等免费 Flash 系列 |
| 腾讯混元 Hunyuan | OpenAI 兼容预设 | 默认 `hunyuan-lite`（免费档） |
| Groq | OpenAI 兼容预设 | Llama / Gemma 等，多档免费额度友好 |
| Gemini | Google Gemini | 含 Flash-Lite 等免费档友好模型 |

- **密钥本地加密存储。** 使用系统凭据设施（macOS Keychain / Windows DPAPI / Linux libsecret）写入 `userData/secrets.json`，不会写入 `.lmi`。
- **按需加载 SDK。** 只导入当前选用的提供商，切换或纯本地模型无额外启动成本。
- **免费档以各平台策略为准。** UI 会标注 `free` 推荐模型；额度与地区限制以服务商当前政策为准。

## GPU 加速

Lumina 通过 ONNX Runtime 使用可用 GPU。

- **同一 Python 环境只能装一种 EP wheel。** DirectML、CUDA、CoreML 不能共存；安装包按平台 / 变体分发（见 [安装包](#安装包)）。
- **macOS = CoreML → Metal。** 官方 ORT 没有独立的 `MetalExecutionProvider`；Apple GPU / Neural Engine 加速即 `CoreMLExecutionProvider`。可用 `LUMINA_EP=coreml` 或 `metal` 强制开启。
- **`LUMINA_EP`：** `auto`（CUDA → CoreML → DirectML → CPU）、`cuda`、`dml`、`coreml` / `metal`、`cpu`。
- **按模型偏好。** 例如 `lama` 仅 CPU；`lama_manga` / `paddleocr_vl` 不用 DirectML（有 CUDA 或 CoreML 则用之，否则 CPU）；部分 OCR 自回归解码器始终在 CPU。

## 安装包

**macOS（本 fork 重点）** — CoreML / Metal，按 CPU 架构分产物（原生 onnxruntime wheel 与架构绑定）：

- **`Lumina-<version>-mac-arm64.dmg`** — Apple Silicon（M1 / M2 / M3 / M4…）
- **`Lumina-<version>-mac-x64.dmg`** — Intel Mac（也可在 Apple Silicon 上经 Rosetta 运行）

```sh
npm run dist:macos          # 当前机器架构
npm run dist:macos:arm64
npm run dist:macos:x64
```

**Windows** — 仍保留上游式双安装包：

- **`Lumina-Setup-DML-<version>.exe`** — DirectML，任意 DirectX 12 GPU（含 NVIDIA）通用；无兼容 GPU 时回退 CPU
- **`Lumina-Setup-CUDA-<version>.exe`** — CUDA 12，仅 NVIDIA；有 RTX/GTX 时通常明显更快

发布物见本仓库 [Releases](https://github.com/ididi404/lumina_mac/releases)。各变体独立更新通道；差分更新，启动时安装。发行说明取自 [CHANGELOG.md](CHANGELOG.md) 中对应 `## [<version>]`；缺失时由提交记录生成。

> **CUDA 说明：** 自上游 v0.3.0 起，CUDA 安装包不再捆绑约 1.4 GB 的 ONNX Runtime，首次运行时下载到用户目录（设置 → 模型可见）。DML 安装包仍内置 runtime。

源码运行时自行选择 wheel：macOS 用 `onnxruntime`（CoreML/Metal），Windows 通用 GPU 用 `onnxruntime-directml`，NVIDIA 用 `onnxruntime-gpu[cuda,cudnn]`，然后 `npm start`。

## 项目文件格式 (.lmi)

`.lmi` 是 zip：内含 `project.json` 清单，以及页面图片与修复蒙版补丁。清单保存页面列表、检测框、图层、排版，以及翻译设置中的非密钥部分。API Key 永不写入该文件。

## 开发

### 环境要求

- Node.js（Electron、esbuild、TypeScript）
- Python 3.13
- 若需要 GPU：
  - **macOS：** 支持 Metal 的 GPU；`onnxruntime`（CoreML EP）
  - **Windows NVIDIA：** CUDA 驱动 + `onnxruntime-gpu[cuda,cudnn]`
  - **Windows 其他：** `onnxruntime-directml` 或纯 CPU
- 模型放入模型目录，或启动后在设置中下载

### 安装与启动

```sh
# Python 后端
python3.13 -m venv venv
# Windows:
venv\Scripts\pip install -r python\requirements.txt
# macOS / Linux:
source venv/bin/activate && pip install -r python/requirements.txt

# 前端
npm install
npm run build
npm start
```

### macOS 打包

```sh
npm run dist:macos
npm run dist:macos:arm64
npm run dist:macos:x64
```

后端由 Electron 主进程自动拉起，无需另开服务。

## 路线图

已知问题与计划见 [TODO.md](TODO.md)。

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。上游历史与本 fork 的 macOS / 中文 / 翻译相关改动一并记录在此文件中。

## 许可证

本项目沿用上游 [MIT License](LICENSE)，仅覆盖源码与应用包。

模型文件 **不** 随包分发，也 **不** 受本许可证约束；各自有独立许可。默认检测器 `rtdetr` 为 Apache-2.0；分割检测 `rfdetr_seg`（Koharu Layout RF-DETR Seg 2XL）基于 [Manga109](https://manga109.github.io/manga109-project-website/en/) 训练，仅限学术非商业研究，作为可选模型提供。

---

上游项目：[lumina-tl/lumina](https://github.com/lumina-tl/lumina) · 本 fork：[ididi404/lumina_mac](https://github.com/ididi404/lumina_mac)
