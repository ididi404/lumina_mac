/** Bilingual model descriptions — OCR. */
import type { ModelDescMap } from "./index";

export const OCR_DESCS: ModelDescMap = {
  manga_ocr: {
    en: `Japanese text recognition trained on manga (original by kha-white, ONNX port by mayocream).

• The most accurate Japanese recognizer of the three — handles vertical, horizontal, stylized, and even handwritten typesetting.
• Japanese only: use it when the source language is Japanese; it won't help for other languages.
• Lightweight and fast.
• Source: huggingface.co/mayocream/manga-ocr-onnx`,
    zh: `针对漫画训练的日文识别（原作者 kha-white，ONNX 移植 mayocream）。

• 三者中日文最准 — 支持竖排、横排、艺术字甚至手写排版。
• 仅日文：源语言为日文时使用；对其它语言无帮助。
• 轻量且快。
• 来源：huggingface.co/mayocream/manga-ocr-onnx`,
  },
  ppocrv6: {
    en: `PP-OCRv6 medium by PaddlePaddle — recognition for 50+ languages including Japanese. Very fast on CPU (~5 ms/line).

• Reads whole lines at once — handles long / multi-line horizontal text better than Baberu OCR.
• For Japanese manga typesetting, manga-ocr or Baberu OCR are still the better choice.
• ⚠ Model limitation: not trained on manga text rendered at an angle, so rotated / skewed text is rarely recognized accurately. When in doubt, try manga-ocr or Baberu OCR.
• Source: huggingface.co/PaddlePaddle/PP-OCRv6_medium_rec_onnx`,
    zh: `PP-OCRv6 medium（PaddlePaddle）— 支持含日文在内的 50+ 语言。CPU 很快（约 5 ms/行）。

• 整行识别 — 长段/多行横排优于 Baberu OCR。
• 日漫排版仍更推荐 manga-ocr 或 Baberu OCR。
• ⚠ 局限：未针对倾斜漫画字训练，旋转/倾斜文字往往不准。不确定时试 manga-ocr 或 Baberu。
• 来源：huggingface.co/PaddlePaddle/PP-OCRv6_medium_rec_onnx`,
  },
  baberu: {
    en: `Baberu OCR (by genshiai-daichi) — a 115M-parameter multilingual model (Japanese / Chinese / English) purpose-built for manga speech bubbles.

• Trained on real manga typesetting: vertical text, horizontal text, and sound effects (SFX).
• Understands stylized bubble layouts better than general-purpose OCR.
• Runs fast on CPU — the recommended default for manga.
• ⚠ Model limitation: long text can be cut off mid-word (e.g. "workhorse" → "wo"). Bubble-level accuracy is strong, but very long bubbles lose the tail end. The translation step can usually reconstruct the missing text from context. For very long bubbles, try PP-OCRv6 instead.
• Source: huggingface.co/genshiai-daichi/baberu-ocr`,
    zh: `Baberu OCR（genshiai-daichi）— 1.15 亿参数多语种模型（日/中/英），专为漫画对话框设计。

• 在真实漫画排版上训练：竖排、横排与拟声词（SFX）。
• 比通用 OCR 更懂艺术化气泡布局。
• CPU 很快 — 漫画推荐默认。
• ⚠ 局限：过长文本可能中途截断（如 "workhorse" → "wo"）。单气泡准确，超长气泡会丢尾部；翻译常可据上下文补全。超长气泡可改用 PP-OCRv6。
• 来源：huggingface.co/genshiai-daichi/baberu-ocr`,
  },
  paddleocr_vl: {
    en: `In development — integration is still being tuned; the app works with it, but output may be unreliable.

PaddleOCR-VL 1.6 (by PaddlePaddle, ONNX port by iaa2005) — a vision-language OCR model (NaViT + ERNIE-4.5 decoder) that reads whole text regions at once, in many languages (zh / en / ru / more).

• Region-based: adjacent text boxes are recognized together in one pass with context — better on multi-line bubbles.
• Multi-language, strongest on zh/en; Japanese manga typesetting is handled better by manga-ocr or Baberu.
• Slow: roughly 10–25 s per page on CPU — a fallback model, not a daily driver.
• ~1.2 GB download.
• Source: huggingface.co/iaa2005/PaddleOCR-VL-1.6-ONNX`,
    zh: `开发中 — 集成仍在调优；可用但结果可能不稳定。

PaddleOCR-VL 1.6（PaddlePaddle，ONNX 移植 iaa2005）— 视觉语言 OCR（NaViT + ERNIE-4.5），一次读完整文本区域，多语种（中/英/俄等）。

• 基于区域：相邻文本框带上下文一次识别 — 更适合多行气泡。
• 多语种，中英最强；日漫排版更推荐 manga-ocr 或 Baberu。
• 较慢：CPU 约 10–25 秒/页 — 备用模型，非日常首选。
• 下载约 1.2 GB。
• 来源：huggingface.co/iaa2005/PaddleOCR-VL-1.6-ONNX`,
  },
};
