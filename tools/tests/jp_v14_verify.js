/* v14 验证：教材内容是否真正融入现有功能模块（而非独立孤岛） */
const fs = require("fs");
const P = "C:/Users/Chen/Desktop/个人/日语学习站/js/";

const stub = () => ({
  innerHTML: "", style: {}, value: "", files: null,
  addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
  focus() {}, querySelector() { return null; }, querySelectorAll() { return []; },
  classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
  closest() { return null; }, click() {}, remove() {}, insertAdjacentHTML() {}
});
global.Audio = function () { return { src: "", play: () => Promise.resolve(), load() {} }; };
global.window = { addEventListener() {}, scrollTo() {}, speechSynthesis: { getVoices: () => [], cancel() {}, speak() {} } };
global.document = {
  addEventListener() {}, querySelector: () => stub(), querySelectorAll: () => [],
  getElementById: () => stub(), createElement: () => stub(), body: { appendChild() {} }
};
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.location = { hash: "#/home" };
global.SpeechSynthesisUtterance = function () {};
global.URL = { createObjectURL: () => "blob:x", revokeObjectURL() {} };
global.Blob = function () {};

["data/kana.js", "data/vocab-n5.js", "data/vocab-n4.js", "data/vocab-n3.js", "data/vocab-n2.js",
 "data/vocab-n1.js", "data/vocab-zjc.js", "data/verbs.js", "data/grammar.js", "data/reading.js",
 "data/textbook.js", "data/audio-map.js", "app.js"]
  .forEach(f => eval(fs.readFileSync(P + f, "utf8")));

const J = globalThis.__JP__;
let pass = 0, fail = 0;
const t = (name, cond, extra) => { if (cond) { pass++; console.log("  ok   " + name); } else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  → " + extra : "")); } };

console.log("\n[1] 生词 → 并入单词卡队列（VOCAB）");
const bkWords = J.VOCAB.N3.filter(v => v.book);
t("教材生词已进 N3 队列", bkWords.length > 0, bkWords.length);
t("带 book 来源标记", bkWords.every(v => v.book === true));
t("字段完整（假名/释义/词性）", bkWords.every(v => v.k && v.z && v.p));
t("与骨架词 id 不冲突", new Set(J.VOCAB.N3.map(v => v.id)).size === J.VOCAB.N3.length);
t("书号前缀区分来源", bkWords[0].id.indexOf("N3-ZJC") === 0, bkWords[0].id);

console.log("\n[2] 生词自动惠及听写 / 翻译（同源词池）");
const pool = J.drillPool("all", "N3");
t("N3 练习词池包含教材词", pool.some(v => v.book), pool.length + " 词");
const withBook = pool.filter(v => v.book).length;
t("池内教材词数 = 数据文件条目数", withBook === (globalThis.VOCAB_ZJC||[]).length, withBook);
// 翻译出题可取到教材词
J.setStateFor("review");
t("听写/翻译共用 drillPool（含教材词）", pool.length === J.VOCAB.N3.length, pool.length + " vs " + J.VOCAB.N3.length);

console.log("\n[3] 语法条目 → 并入语法库（GRAMMAR）");
const all = J.GRAMMAR;
const bkG = all.filter(x => x.from);
// 条数写成**下界**而不是等号：内容只增不减，写死总数会在每次补充内容时误报
// （2026-09-28 就因为新增了 140 条语法而红过一次，其实数据完全正常）
t("教材语法条目 ≥ 448", bkG.length >= 448, bkG.length);
t("可按等级筛选（N3）", all.filter(x => x.lv === "N3").length >= 142, all.filter(x => x.lv === "N3").length);
t("N2 含教材条目", all.filter(x => x.lv === "N2").length >= 212, all.filter(x => x.lv === "N2").length);
t("N1 含教材条目", all.filter(x => x.lv === "N1").length >= 207, all.filter(x => x.lv === "N1").length);
t("标注了教材出处", bkG.every(x => x.m.indexOf("教材句型") >= 0 && x.m.indexOf("课") >= 0));
t("带课次（可用于筛选/排序）", bkG.every(x => Number.isInteger(x.l)));
t("条目 id 唯一", new Set(all.map(x => x.id)).size === all.length);
t("教材条目有独立 id 前缀", bkG.every(x => x.id.indexOf("bk-") === 0));
t("原有语法条目未被破坏（只增不减）", all.filter(x => !x.from).length >= 214, all.filter(x => !x.from).length);
t("N3 首条是原语法（教材条目在后）", all.filter(x => x.lv === "N3")[0].from === undefined);

console.log("\n[4] 课文 → 并入文章精读（READING）");
const bkRead = J.READING.filter(a => a.from);
t("教材课文已进精读", bkRead.length >= 1, bkRead.length);
const art = bkRead[0];
t("课文标题与来源", art.t === "日本の鉄道" && art.from.indexOf("中级上") >= 0, art.t + " / " + art.from);
t("级别为 N3", art.lv === "N3");
t("逐句含日文/假名/中文", art.s.every(s => s.j && s.k && s.z));
t("含语法标注", art.s.some(s => s.g));
t("含挖空点（可用于填空）", art.s.filter(s => s.b).length >= 5, art.s.filter(s => s.b).length);
t("含理解题", art.q.length >= 2, art.q.length);
t("理解题答案索引合法", art.q.every(q => q.a >= 0 && q.a < q.o.length));
t("挖空答案在原句中", art.s.filter(s => s.b).every(s => s.j.indexOf(s.b.a) >= 0));
t("文章 id 唯一", new Set(J.READING.map(a => a.id)).size === J.READING.length);

console.log("\n[5] 界面体现归属关系");
J.rd.lv = "N3";   // 教材课文在 N3，需先切级别
const hl = J.readListHTML();
t("文章列表显示教材来源", hl.indexOf("中级上 第1课") >= 0);
t("教材文章有「教材」标记", hl.indexOf(">教材<") >= 0);
const ht = J.viewTextbook();
t("教材大纲说明内容去向", ht.indexOf("并入各功能模块") >= 0);
t("说明生词去向", ht.indexOf("单词卡") >= 0);
t("说明语法去向", ht.indexOf("语法库") >= 0);
t("说明课文去向", ht.indexOf("文章精读") >= 0);

console.log("\n[6] 端到端：教材内容走通各功能");
// 语法库筛选
const gN3 = J.GRAMMAR.filter(x => x.lv === "N3");
t("语法库 N3 可列出教材条目", gN3.filter(x => x.from).length === 102, gN3.filter(x => x.from).length);
// 填空判分可作用于教材课文
const b = art.s.filter(s => s.b)[0];
t("教材课文挖空可判分", J.matchBlank(b.b, b.b.a) === true && J.matchBlank(b.b, b.b.k) === true);
// 词库重建不丢教材词
J.rebuildAll();
t("rebuildAll 后教材词仍在", J.VOCAB.N3.filter(v => v.book).length > 0, J.VOCAB.N3.filter(v => v.book).length);
t("rebuildAll 后教材语法仍在", J.GRAMMAR.filter(x => x.from).length === 448, J.GRAMMAR.filter(x => x.from).length);

console.log("\n[7] 回归");
t("N5/N4 未受影响", J.VOCAB.N5.length === 528 && J.VOCAB.N4.length === 500);
t("变形引擎正常", J.conj("いく", 1, "te") === "いって");
t("真人音索引 1040", Object.keys(globalThis.AUDIO_MAP).length === 1040);
t("学习/复习仍独立", J.ls !== J.rs);
t("教材大纲 4 本", J.TEXTBOOK.length === 4);

console.log("\n结果：" + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);
