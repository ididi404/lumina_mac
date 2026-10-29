/** Bilingual model descriptions — Inpainting. */
import type { ModelDescMap } from "./index";

export const INPAINT_DESCS: ModelDescMap = {
  lama: {
    en: `Big-LaMa general-purpose inpainting (OpenCV build, Jan 2025 ONNX).

• Trained on natural/real imagery — solid all-round quality for removing text on any artwork.
• On manga screentones and line art, the LaMa Manga fine-tune below usually reconstructs cleaner.
• Good fallback when you want a smaller, faster download.
• Source: huggingface.co/opencv/inpainting_lama`,
    zh: `Big-LaMa 通用修复（OpenCV 构建，2025-01 ONNX）。

• 在自然图像上训练 — 去除各类画面上的文字效果扎实。
• 漫画网点与线稿上，下方的 LaMa Manga 微调通常更干净。
• 需要更小更快下载时的可靠备选。
• 来源：huggingface.co/opencv/inpainting_lama`,
  },
  lama_manga: {
    en: `Big-LaMa fine-tuned on ~300K manga & anime images (Sanster AnimeMangaInpainting checkpoint, ONNX conversion by koharu).

• Best-in-class for manga pages: reconstructs screentones, line art, and textures around removed text so patches blend into the artwork.
• The recommended default for inpainting.
• Larger file — the first download takes a bit longer.
• Source: huggingface.co/mayocream/lama-manga-onnx`,
    zh: `Big-LaMa 在约 30 万张漫画/动画图上微调（Sanster AnimeMangaInpainting，koharu 转 ONNX）。

• 漫画页首选：重建网点、线稿与纹理，补丁更贴合原画。
• 修复推荐默认。
• 文件更大 — 首次下载稍久。
• 来源：huggingface.co/mayocream/lama-manga-onnx`,
  },
};
