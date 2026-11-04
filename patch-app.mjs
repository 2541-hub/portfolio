// 用法：喺網站資料夾（有 package.json 嗰層）終端機輸入  node patch-app.mjs
// 會自動修改 src/App.tsx，令 ARCHIVE 頁文字、[ INTERACTIVE_TOPOLOGY_PLACEHOLDER ]、
// 左下角文字都由管理頁控制。重複行幾多次都安全，已經改過嘅位置會跳過。
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const file = 'src/App.tsx';
let s = readFileSync(file, 'utf8');
copyFileSync(file, 'src/App.tsx.bak'); // 先備份

const report = [];

function patch(name, alreadyDone, from, to) {
  if (alreadyDone) {
    report.push(`已經改過，跳過：${name}`);
    return;
  }
  const found = typeof from === 'string' ? s.includes(from) : from.test(s);
  if (!found) {
    report.push(`搵唔到，請話俾 Claude 知：${name}`);
    return;
  }
  s = s.replace(from, to);
  report.push(`已修改：${name}`);
}

patch(
  '載入雲端內容',
  s.includes('__CLOUD_CONTENT__'),
  "import works from './works.json';",
  "import localWorks from './works.json';\nconst works: any = (window as any).__CLOUD_CONTENT__ ?? localWorks;"
);

patch(
  'ARCHIVE 頁讀取設定',
  s.includes('const about: any'),
  'const ViewIdentityArchive = () => {',
  'const ViewIdentityArchive = () => {\n  const about: any = (works as any).about || {};'
);

patch(
  '[ INTERACTIVE_TOPOLOGY_PLACEHOLDER ]',
  s.includes('about.topLabel'),
  '>[ INTERACTIVE_TOPOLOGY_PLACEHOLDER ]<',
  ">{about.topLabel ?? '[ INTERACTIVE_TOPOLOGY_PLACEHOLDER ]'}<"
);

patch(
  '大標題',
  s.includes('about.heading'),
  'mb-8">DIGITAL PRODUCER</h1>',
  'mb-8">{about.heading ?? \'DIGITAL PRODUCER\'}</h1>'
);

patch(
  '副標題',
  s.includes('about.subtitle'),
  '<p>SYSTEM ARCHITECT / VISUAL DIRECTOR / INTERACTION DESIGNER</p>',
  "<p>{about.subtitle ?? 'SYSTEM ARCHITECT / VISUAL DIRECTOR / INTERACTION DESIGNER'}</p>"
);

patch(
  '介紹文字',
  s.includes('about.bio'),
  '<p className="text-[#555]">BASED IN STRUCTURAL LOGIC. OPERATING ACROSS MEDIUMS. REDEFINING BOUNDARIES THROUGH CONTROLLED CHAOS.</p>',
  "<p className=\"text-[#555]\">{about.bio ?? 'BASED IN STRUCTURAL LOGIC. OPERATING ACROSS MEDIUMS. REDEFINING BOUNDARIES THROUGH CONTROLLED CHAOS.'}</p>"
);

patch(
  '碎片區標題',
  s.includes('about.memoryLabel'),
  '[ Deconstructed Memory Bank ]</div>',
  "{about.memoryLabel ?? '[ Deconstructed Memory Bank ]'}</div>"
);

patch(
  '左下角文字',
  s.includes('about?.footer'),
  /DIGITAL PRODUCER PORTFOLIO <br\/>\s*ITERATION_01 ©2026 <br\/>\s*SYS\.CONTAINER_ACTIVE/,
  "{String((works as any).about?.footer ?? 'DIGITAL PRODUCER PORTFOLIO\\nITERATION_01 ©2026\\nSYS.CONTAINER_ACTIVE').split('\\n').map((line: string, i: number) => (<span key={i}>{line}<br /></span>))}"
);

writeFileSync(file, s);
console.log(report.join('\n'));
console.log('\n完成。原檔案備份喺 src/App.tsx.bak');
