/* 构建脚本：把模块化源码打包成单文件 HTML
 * 用法：node build.js
 * 输出：../日语学习站_dist/index.html （用于部署）
 *       ../日语学习站_单文件版.html   （本地双击版，内容相同）
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");   // 仓库内，Netlify publish = 日语学习站/dist
const OUT_NAME = "日语学习站_单文件版.html";

const css = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
const files = [
  "js/data/kana.js",
  "js/data/vocab-n5.js",
  "js/data/vocab-n4.js",
  "js/data/vocab-n3.js",
  "js/data/vocab-n2.js",
  "js/data/vocab-n1.js",
  "js/data/verbs.js",
  "js/data/grammar.js",
  "js/data/reading.js",
  "js/data/audio-map.js",
  "js/app.js"
];
let js = "";
files.forEach(function (f) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { console.log("（跳过缺失文件）" + f); return; }
  js += "/* ==== " + f + " ==== */\n" + fs.readFileSync(p, "utf8") + "\n";
});

const d = new Date();
const stamp = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") + " " +
  String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>日语学习站 · 零基础 → N2 → N1</title>
<meta name="theme-color" content="#8b83f0">
<meta name="description" content="日语自学：五十音训练、SRS 单词卡、语法库、动词变形训练、学习仪表盘。零基础到 N1。">
<link rel="manifest" href="./manifest.webmanifest">
<link rel="icon" href="./icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="./icon.svg">
<style>
${css}
</style>
</head>
<body>
<header class="top">
  <div class="brand">日本語<span>零基础 → N2 → N1</span></div>
  <nav class="nav">
    <a href="#/home">首页</a>
    <a href="#/kana">五十音</a>
    <a href="#/learn">学新词</a>
    <a href="#/review">复习</a>
    <a href="#/grammar">语法库</a>
    <a href="#/drill">变形训练</a>
    <a href="#/dict">听写</a>
    <a href="#/trans">翻译</a>
    <a href="#/read">文章精读</a>
    <a href="#/dash">仪表盘</a>
    <a href="#/wrong">错词本</a>
    <a href="#/custom">我的词库</a>
  </nav>
</header>
<main id="app"></main>
<footer class="foot">
  数据保存在你自己的浏览器（localStorage）· 建议每天 30-60 分钟 · 先打满 N5/N4，再推 N3 → N2 → N1
  <br>版本：${stamp}
</footer>
<script>
${js}
</script>
</body>
</html>`;

// 1) 部署用 dist（仓库内 日语学习站/dist —— Netlify publish 目录）
if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, "index.html"), html, "utf8");
["sw.js", "manifest.webmanifest", "icon.svg"].forEach(function (f) {
  const src = path.join(ROOT, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DIST, f));
});
// 1b) 同步一份到仓库外的 日语学习站_dist（保持本地手动部署习惯）
const DIST_OUT = path.join(ROOT, "..", "日语学习站_dist");
try {
  if (!fs.existsSync(DIST_OUT)) fs.mkdirSync(DIST_OUT, { recursive: true });
  fs.writeFileSync(path.join(DIST_OUT, "index.html"), html, "utf8");
  ["sw.js", "manifest.webmanifest", "icon.svg"].forEach(function (f) {
    const src = path.join(ROOT, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DIST_OUT, f));
  });
} catch (e) {}
// 2) 本地双击版
fs.writeFileSync(path.join(ROOT, "..", OUT_NAME), html, "utf8");

const kb = (fs.statSync(path.join(DIST, "index.html")).size / 1024).toFixed(0);
console.log("构建完成");
console.log("  " + DIST + "\\index.html   (" + kb + " KB)");
console.log("  " + path.join(ROOT, "..", OUT_NAME) + "   (" + kb + " KB)");
