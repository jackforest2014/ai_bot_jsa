#!/usr/bin/env node
/**
 * 校验 docs/presentation 下 Markdown 的「## 目录」锚点是否与 GitHub 标题 slug 一致。
 *
 * 用途、用法见同目录 README.md，或运行: node scripts/check-presentation-toc.mjs --help
 */

import GithubSlugger from 'github-slugger';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = { help: false, dir: path.join(REPO_ROOT, 'docs', 'presentation') };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--dir' && argv[i + 1]) {
      out.dir = path.resolve(REPO_ROOT, argv[++i]);
    }
  }
  return out;
}

function printHelp() {
  console.log(`check-presentation-toc — 校验演讲文档目录中的 # 锚点

用法:
  npm run check:presentation-toc
  node scripts/check-presentation-toc.mjs [--dir <markdown目录>]

选项:
  --dir <path>  要扫描的目录（默认: docs/presentation，相对仓库根目录）
  -h, --help    显示本说明

说明:
  使用与 GitHub 渲染 Markdown 标题相同的 slug 规则（github-slugger）。
  若修改了章节标题，请同步更新目录里的链接文字与 # 锚点。
`);
}

/**
 * 从文件中解析「## 目录」下的 TOC 项：`- [显示文字](#锚点)`
 */
function parseTocEntries(lines) {
  const idx = lines.findIndex((l) => l.trim() === '## 目录');
  if (idx === -1) return null;

  const entries = [];
  for (let j = idx + 1; j < lines.length; j++) {
    const line = lines[j];
    const t = line.trim();
    if (t === '---') break;
    const m = line.match(/^- \[(.+?)\]\((#[^)]+)\)\s*$/);
    if (m) {
      entries.push({ text: m[1], href: m[2], lineNo: j + 1 });
      continue;
    }
    if (t === '') continue;
    if (/^## /.test(line)) break;
    break;
  }
  return entries;
}

function collectH2Headings(lines) {
  const headings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^## /.test(line) && line.trim() !== '## 目录') {
      headings.push({ text: line.slice(3).trim(), lineNo: i + 1 });
    }
  }
  return headings;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!fs.existsSync(args.dir) || !fs.statSync(args.dir).isDirectory()) {
    console.error(`错误: 目录不存在或不是文件夹: ${args.dir}`);
    process.exit(2);
  }

  const files = fs
    .readdirSync(args.dir)
    .filter((f) => f.endsWith('.md'))
    .sort();

  const slugger = new GithubSlugger();
  let errors = 0;
  let checkedFiles = 0;

  for (const file of files) {
    const full = path.join(args.dir, file);
    const content = fs.readFileSync(full, 'utf8');
    const lines = content.split(/\n/);
    const toc = parseTocEntries(lines);
    if (!toc || toc.length === 0) continue;

    checkedFiles++;
    const headings = collectH2Headings(lines);
    const headingTexts = new Set(headings.map((h) => h.text));

    for (const { text, href, lineNo } of toc) {
      slugger.reset();
      const expected = '#' + slugger.slug(text);
      if (expected !== href) {
        errors++;
        console.error(
          `[锚点不符] ${file}:${lineNo}\n  目录文字: ${JSON.stringify(text)}\n  当前锚点: ${href}\n  应为:     ${expected}\n`,
        );
      }
      if (!headingTexts.has(text)) {
        errors++;
        console.error(
          `[目录与标题不一致] ${file}:${lineNo}\n  目录条目文字在文中没有对应的「## ${text}」二级标题（请检查是否改名或漏写）。\n`,
        );
      }
    }
  }

  if (checkedFiles === 0) {
    console.error(`未找到带「## 目录」的 Markdown 文件: ${args.dir}`);
    process.exit(2);
  }

  if (errors > 0) {
    console.error(`共 ${errors} 个问题（${checkedFiles} 个文件含目录）。`);
    process.exit(1);
  }

  console.log(`OK — 已校验 ${checkedFiles} 个文件的目录锚点（${args.dir}）。`);
  process.exit(0);
}

main();
