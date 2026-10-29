/** Bilingual model descriptions — Text Detection. */
import type { ModelDescMap } from "./index";

export const DETECT_DESCS: ModelDescMap = {
  rtdetr: {
    en: `RT-DETR v2 r50vd fine-tuned on comics (by ogkalu) — detects text boxes and speech bubbles on manga pages with high accuracy.

• The default detector — Apache-2.0 licensed, safe to use for any purpose.
• Fast box-only detection, no segmentation mask output.
• Works reliably on clean pages as well as pages with screentones.
• Inpainting falls back to heuristic (Otsu) masking inside each box.
• Source: huggingface.co/ogkalu/comic-text-and-bubble-detector`,
    zh: `RT-DETR v2 r50vd（ogkalu，漫画微调）— 高精度检测漫画页中的文本框与对话框。

• 默认检测器 — Apache-2.0 许可，可用于任意用途。
• 仅输出检测框，无分割蒙版。
• 在干净页面与网点纸页面上均较稳定。
• 修复阶段在框内回退到启发式（Otsu）蒙版。
• 来源：huggingface.co/ogkalu/comic-text-and-bubble-detector`,
  },
  rfdetr_seg: {
    en: `Koharu Layout RF-DETR Seg 2XL (1152px, by ShiniShiho) — segmentation model that outputs precise per-text instance masks.

• Best-quality segmentation, but trained on the Manga109 dataset — academic/research use only (see License).
• Produces a full-page binary text mask, so inpainting erases exactly the glyph pixels instead of a rough box — much better on colorful and detailed pages.
• Onomatopoeia/SFX are deliberately kept as artwork, only text is erased.
• Slower on CPU (~10-30s/page).
• Source: huggingface.co/ShiniShiho/koharu-layout-rfdetr-seg-2xl-1152-onnx`,
    zh: `Koharu Layout RF-DETR Seg 2XL（1152px，ShiniShiho）— 输出精确的逐文本实例分割蒙版。

• 分割质量最佳，但基于 Manga109 训练 — 仅限学术/研究用途（见 License）。
• 生成整页二值文本蒙版，修复时精确擦除字形像素而非粗框 — 彩色与细节页效果更好。
• 拟声词/SFX 作为画面保留，只擦除文字。
• CPU 较慢（约 10–30 秒/页）。
• 来源：huggingface.co/ShiniShiho/koharu-layout-rfdetr-seg-2xl-1152-onnx`,
  },
};
