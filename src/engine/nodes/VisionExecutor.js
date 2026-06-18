/**
 * Vision 视觉节点执行器（图片分析 / OCR）。
 * @since 2025-01 阶段2：从 executor.js 拆出的独立策略执行器。
 */
import path from 'node:path';
import fs from 'fs-extra';
import { registerNodeExecutor } from '../registry.js';

class VisionExecutor {
  async execute(node, inputData, ctx) {
    const { adapters, onLog, timeout } = ctx;
    const modelId = node.data?.modelId || node.data?.config?.modelId;
    const adapter = adapters[modelId];
    if (!adapter) throw new Error(`Vision model adapter "${modelId}" not found`);
    if (typeof adapter.vision !== 'function') throw new Error(`Adapter "${modelId}" does not support vision`);

    const imagePath = node.data?.config?.imagePath || inputData?.imagePath || inputData?.filePath;
    let imageData;
    if (imagePath) {
      const fullPath = path.resolve(imagePath);
      if (!fs.existsSync(fullPath)) throw new Error(`Image not found: ${imagePath}`);
      const ext = path.extname(fullPath).toLowerCase().replace('.', '');
      const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
      const b64 = fs.readFileSync(fullPath).toString('base64');
      imageData = { mime, data: b64 };
    } else if (inputData?.image) {
      imageData = inputData.image;
    } else {
      throw new Error('Vision node requires an image path or inline image data');
    }

    const prompt = node.data?.config?.prompt || 'Describe this image in detail.';
    const messages = [
      { role: 'user', content: prompt, images: [imageData] },
    ];
    const result = await adapter.vision(messages, { timeout });
    return result;
  }
}

registerNodeExecutor('vision', new VisionExecutor());
