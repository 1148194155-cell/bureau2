/**
 * FileOutput 文件输出节点执行器（json/csv/md/html/txt）。
 * @since 2025-01 阶段2：从 executor.js 拆出的独立策略执行器。
 */
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import { registerNodeExecutor } from '../registry.js';

class FileOutputExecutor {
  async execute(node, inputData, ctx) {
    const { onLog, outputDir } = ctx;
    const config = node.data?.config || {};
    const format = config.format || 'txt';
    let fileName = config.fileName || config.filename || `output_${node.id || Date.now()}`;

    // Security: prevent writing to system directories
    let outputPath = outputDir || config.outputDir || path.join(process.cwd(), 'output');
    if (process.platform === 'win32') {
      const resolved = path.resolve(outputPath).toLowerCase();
      const systemDirs = [
        path.resolve('C:\\Windows').toLowerCase(),
        path.resolve('C:\\Windows\\System32').toLowerCase(),
        path.resolve('C:\\Windows\\System').toLowerCase(),
        path.resolve('C:\\Program Files').toLowerCase(),
        path.resolve('C:\\Program Files (x86)').toLowerCase(),
      ];
      for (const sysDir of systemDirs) {
        if (resolved.startsWith(sysDir)) {
          throw new Error(`Cannot write to system directory: ${outputPath}`);
        }
      }
    }
    await fs.ensureDir(outputPath);

    const extMap = { json: '.json', txt: '.txt', md: '.md', csv: '.csv', html: '.html', xml: '.xml', yaml: '.yaml', png: '.png', jpg: '.jpg', svg: '.svg' };
    const ext = extMap[format] || '.txt';
    const filePath = path.join(outputPath, `${fileName}${ext}`);

    const template = config.template || '';
    const actualData = inputData?.output || inputData?.result || inputData;
    let content;

    if (format === 'json') {
      content = template
        ? renderTemplate(template, actualData)
        : JSON.stringify(actualData, null, 2);
    } else if (format === 'csv') {
      content = template
        ? renderTemplate(template, actualData)
        : toCsv(actualData);
    } else if (format === 'html') {
      content = template
        ? wrapHtml(renderTemplate(template, actualData))
        : wrapHtml(JSON.stringify(actualData, null, 2));
    } else if (format === 'md') {
      content = template
        ? renderTemplate(template, actualData)
        : toMarkdown(actualData);
    } else if (format === 'txt') {
      content = typeof actualData === 'string' ? actualData : JSON.stringify(actualData, null, 2);
    } else {
      content = JSON.stringify({ format, data: actualData, note: `Format "${format}" requires a skill for native generation` }, null, 2);
    }

    await fs.writeFile(filePath, content, 'utf8');
    const stat = await fs.stat(filePath);
    onLog('info', `File written: ${filePath} (${stat.size} bytes, format=${format})`);
    return { filePath, format, fileName: fileName + ext, size: stat.size };
  }
}

function renderTemplate(tmpl, data) {
  return tmpl.replace(/\{\{\s*(\S+?)\s*\}\}/g, (_, key) => {
    const val = getNestedValue(data, key);
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

function getNestedValue(obj, path) {
  if (!path || typeof path !== 'string') return obj;
  return path.split('.').reduce((acc, key) => (acc != null ? acc[key] : undefined), obj);
}

function toCsv(data) {
  const rows = Array.isArray(data) ? data : [data];
  if (rows.length === 0) return '';
  const keys = Object.keys(rows[0]);
  const header = keys.map(v => csvEscape(v)).join(',');
  const body = rows.map(row => keys.map(k => csvEscape(row[k] ?? '')).join(','));
  return [header, ...body].join('\n');
}

function csvEscape(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function wrapHtml(body) {
  return `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"><title>Output</title></head>\n<body>\n${body}\n</body>\n</html>`;
}

function toMarkdown(data) {
  if (typeof data === 'string') return data;
  if (typeof data !== 'object' || data === null) return String(data);
  const lines = [];
  for (const [k, v] of Object.entries(data)) {
    const val = typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);
    lines.push(`- **${k}**: ${val}`);
  }
  return lines.join('\n');
}

registerNodeExecutor('file_output', new FileOutputExecutor());
