import puppeteer from '/home/simplyrms/alex-hubspot/proposal-gen/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { readFileSync } from 'fs';

const MD_PATH = '/home/simplyrms/.openclaw/workspace/dominos_clevel_report_sep8_2026.md';
const OUT_PATH = '/home/simplyrms/veyn-bi/proposals/dominos_clevel_report_sep8_2026.pdf';

const md = readFileSync(MD_PATH, 'utf-8');

// Convert markdown to HTML manually (tables, headings, bold, lists, hr)
function mdToHtml(text) {
  return text
    // headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // blockquote
    .replace(/^> \*\*(.+?)\*\*: (.+)$/gm, '<blockquote><strong>$1:</strong> $2</blockquote>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // tables
    .replace(/(?:^\|.+\|$\n?)+/gm, match => {
      const rows = match.trim().split('\n').filter(r => !/^\|[-| :]+\|$/.test(r));
      const html = rows.map((row, i) => {
        const cells = row.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const tag = i === 0 ? 'th' : 'td';
        return '<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
      }).join('\n');
      return `<table>${html}</table>\n`;
    })
    // hr
    .replace(/^---$/gm, '<hr>')
    // unordered list items
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]+?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')
    // numbered list
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // paragraphs (blank-line separated blocks not already tagged)
    .replace(/(?<!\n<[^>]+>)(\n\n)(?!\s*<[h1-6|table|ul|blockquote|hr])/g, '</p><p>')
    // inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

const body = mdToHtml(md);

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1a1a2e; background: #fff; padding: 40px 50px; line-height: 1.6; }
  h1 { font-size: 22pt; color: #0d2060; border-bottom: 3px solid #e8171f; padding-bottom: 10px; margin: 24px 0 10px; }
  h2 { font-size: 15pt; color: #0d2060; margin: 28px 0 10px; border-left: 4px solid #e8171f; padding-left: 10px; }
  h3 { font-size: 12pt; color: #333; margin: 18px 0 8px; }
  p { margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10pt; }
  th { background: #0d2060; color: #fff; padding: 7px 10px; text-align: left; }
  td { padding: 6px 10px; border-bottom: 1px solid #e0e0e0; }
  tr:nth-child(even) td { background: #f7f8fc; }
  blockquote { background: #f0f4ff; border-left: 4px solid #0d2060; padding: 10px 16px; margin: 12px 0; font-style: italic; border-radius: 0 4px 4px 0; }
  ul { margin: 6px 0 6px 22px; }
  li { margin: 3px 0; }
  hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
  code { background: #f4f4f4; padding: 1px 5px; border-radius: 3px; font-size: 9.5pt; }
  strong { color: #0d2060; }
  .cover { text-align: center; padding: 60px 20px 40px; border-bottom: 3px solid #e8171f; margin-bottom: 30px; }
  .cover h1 { border: none; font-size: 28pt; }
  .cover .subtitle { font-size: 14pt; color: #555; margin-top: 8px; }
  .cover .meta { font-size: 10pt; color: #888; margin-top: 16px; }
  .dominos-red { color: #e8171f; }
</style>
</head>
<body>
${body}
</body>
</html>`;

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle0' });
await page.pdf({
  path: OUT_PATH,
  format: 'A4',
  printBackground: true,
  margin: { top: '15mm', right: '12mm', bottom: '15mm', left: '12mm' },
});
await browser.close();
console.log('PDF generated:', OUT_PATH);
