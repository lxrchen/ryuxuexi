/* 精读数据自检（js/data/reading.js）
 *
 * 用法：node tools/check-reading.js
 *
 * 台账「精读课文录入进度.md」把这件事写成"必做"，但一直没有可执行脚本 ——
 * 每次都靠临时手写检查，容易漏。这里固化成一条命令。
 *
 * 检查项
 *   1. id 唯一、必要字段齐全（教材条目额外要求 from）
 *   2. note 行不得带 j/k/z（它是场景提示，不朗读、不编号、不参与填空）
 *   3. 句子三字段齐全（j 日文 / k 假名 / z 中文）
 *   4. 挖空答案必须**存在于原句中且只出现一次**
 *      —— 判分渲染用 j.split(a).join("____")，出现多次会被全部替换污染题目
 *   5. 挖空须带 k（假名）与 h（提示）
 *   6. 理解题索引不越界、选项不重复、必须带解析 z
 *   7. 跨篇无重复「实质长句」：剥离空格与标点后 ≥15 字才判重复
 *      —— 教材对话里「そうですか。」「ありがとう ございます。」这类寒暄
 *         必然反复出现，按整串去重会误报；要防的是整段照抄。
 *   8. 初级上课次齐全（rd-cs-1..N），缺课说明录入中断
 *
 * ⚠️ 挖空「断词」是本项目的高频坑（已踩 3 次）：
 *    日语句子内有分词空格，如 `親子丼を ください`、`気に 入りましたか`、
 *    `京劇を 見に 来て ください`。答案写成 `をください` / `気に入りました` /
 *    `見に来て` 都匹配不到。规则：连空格一起抄，或避开空格处取词。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "js", "data", "reading.js");

// 初级上课次录到第几课（录完全部 24 课后改成 24）
const CS_TOTAL = 24;

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SRC, "utf8") + "\n;globalThis.__R = READING;", ctx);
const R = ctx.__R;

let bad = 0;
const problems = [];
const notes = [];
const fail = (m) => { bad++; problems.push(m); };

const ids = new Set();
const sents = new Set();

R.forEach((a) => {
  if (ids.has(a.id)) fail("id 重复：" + a.id);
  ids.add(a.id);
  if (!a.id || !a.lv || !a.t || !a.zh) fail("字段缺失：" + a.id);
  // 教材条目必须能追溯出处；原创文章没有 from
  if (/^rd-(cs|cx|zjc|gjs|gjx)-/.test(a.id) && !a.from) fail("教材条目缺 from：" + a.id);
  if (!a.s || !a.s.length) fail("没有句子：" + a.id);
  if (!a.q || !a.q.length) fail("没有理解题：" + a.id);

  (a.s || []).forEach((s, i) => {
    if (s.note !== undefined) {
      if (s.j !== undefined) fail("note 行不应带 j：" + a.id + " #" + i);
      return;
    }
    if (!s.j || !s.k || !s.z) { fail("句子三字段不齐：" + a.id + " #" + i); return; }
    if (sents.has(s.j) && s.j.replace(/[\s、。？！…「」]/g, "").length >= 15) {
      notes.push("跨篇重复长句：" + a.id + " #" + i + " | " + s.j.slice(0, 24));
    }
    sents.add(s.j);
    if (s.b) {
      const n = s.j.split(s.b.a).length - 1;
      if (n !== 1) fail("挖空答案出现 " + n + " 次（须恰好 1 次）：" + a.id + " #" + i + " | " + s.b.a);
      if (!s.b.k || !s.b.h) fail("挖空缺 k/h：" + a.id + " #" + i);
    }
  });

  (a.q || []).forEach((q, i) => {
    if (!q.q || !q.o || typeof q.a !== "number" || !q.z) { fail("理解题字段缺失：" + a.id + " #" + i); return; }
    if (q.a < 0 || q.a >= q.o.length) fail("理解题答案越界：" + a.id + " #" + i);
    if (new Set(q.o).size !== q.o.length) fail("理解题选项重复：" + a.id + " #" + i);
  });
});

// 课次齐全性
const missing = [];
for (let n = 1; n <= CS_TOTAL; n++) if (!ids.has("rd-cs-" + n)) missing.push(n);
if (missing.length) fail("初级上课文缺课次：" + missing.join(", "));

// 汇总
const byLv = {};
R.forEach((a) => { byLv[a.lv] = (byLv[a.lv] || 0) + 1; });
console.log("精读文章 " + R.length + " 篇 ｜ 句子 " + sents.size + " 句");
console.log("按等级：" + Object.keys(byLv).sort().map((k) => k + " " + byLv[k]).join(" ｜ "));
console.log("教材课文：" + R.filter((a) => a.from).length + " 篇 ｜ 初级上 "
  + R.filter((a) => /^rd-cs-\d+$/.test(a.id)).length + " / " + CS_TOTAL + " 课");
problems.forEach((m) => console.log("  ✗ " + m));
notes.forEach((m) => console.log("  ! " + m));
console.log((bad ? "✗" : "✓") + " 自检结束：" + bad + " 个问题 / " + notes.length + " 个提示");
process.exitCode = bad ? 1 : 0;
