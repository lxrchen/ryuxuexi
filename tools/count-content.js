// 统计各数据文件的词条 / 语法条数（扩充内容前后对照用）
// 用法: node tools/count-content.js
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const DIR = path.join(__dirname, "..", "js", "data");
const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);

const FILES = [
  "vocab-n5", "vocab-n4", "vocab-n3", "vocab-n2", "vocab-n1",
  "grammar", "verbs", "kana", "vocab-zjc", "textbook", "reading", "audio-map",
];

let fail = 0;
for (const f of FILES) {
  const p = path.join(DIR, f + ".js");
  if (!fs.existsSync(p)) { console.log("MISSING", f); fail++; continue; }
  try {
    vm.runInContext(fs.readFileSync(p, "utf8"), ctx);
  } catch (e) {
    console.log("EVAL FAIL " + f + ":", e.message);
    fail++;
  }
}

const n = (a) => (Array.isArray(a) ? a.length : 0);
const g = ctx;

console.log("=== 单词 ===");
console.log("N5 ", n(g.VOCAB_N5));
console.log("N4 ", n(g.VOCAB_N4));
console.log("N3 ", n(g.VOCAB_N3));
console.log("N2 ", n(g.VOCAB_N2));
console.log("N1 ", n(g.VOCAB_N1));
console.log("教材(中级上) ", n(g.VOCAB_ZJC));
console.log("合计(内置) ", n(g.VOCAB_N5) + n(g.VOCAB_N4) + n(g.VOCAB_N3) + n(g.VOCAB_N2) + n(g.VOCAB_N1));

console.log("=== 语法 ===");
console.log("总条数 ", n(g.GRAMMAR));
const gl = {};
for (const x of g.GRAMMAR || []) gl[x[0]] = (gl[x[0]] || 0) + 1;
console.log("分等级 ", JSON.stringify(gl));

console.log("=== 动词 / 形容词 ===");
console.log("动词 ", n(g.VERBS), " 形容词 ", n(g.ADJ));

console.log("=== 主题分布 ===");
for (const name of ["VOCAB_N3", "VOCAB_N2", "VOCAB_N1"]) {
  const m = {};
  for (const x of g[name] || []) m[x.l] = (m[x.l] || 0) + 1;
  console.log(name, JSON.stringify(m));
}

process.exit(fail ? 1 : 0);
