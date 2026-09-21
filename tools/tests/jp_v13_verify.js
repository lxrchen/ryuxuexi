/* v13 验证：教材大纲（中级/高级 课程结构 + 语法条目） */
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
global.location = { hash: "#/textbook" };
global.SpeechSynthesisUtterance = function () {};
global.URL = { createObjectURL: () => "blob:x", revokeObjectURL() {} };
global.Blob = function () {};

["data/kana.js", "data/vocab-n5.js", "data/vocab-n4.js", "data/vocab-n3.js", "data/vocab-n2.js",
 "data/vocab-n1.js", "data/verbs.js", "data/grammar.js", "data/reading.js", "data/textbook.js",
 "data/audio-map.js", "app.js"]
  .forEach(f => eval(fs.readFileSync(P + f, "utf8")));

const J = globalThis.__JP__;
let pass = 0, fail = 0;
const t = (name, cond, extra) => { if (cond) { pass++; console.log("  ok   " + name); } else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  → " + extra : "")); } };

const T = J.TEXTBOOK;

console.log("\n[1] 四本教材数据");
t("共 4 本", T.length === 4, T.length);
t("书名齐全", T.map(b => b.name).join("/") === "中级上/中级下/高级上/高级下", T.map(b => b.name).join("/"));
t("等级映射 N3/N2/N1/N1", T.map(b => b.lv).join("/") === "N3/N2/N1/N1", T.map(b => b.lv).join("/"));
t("每本都有单元结构", T.every(b => b.units.length > 0));
t("每本都有语法条目", T.every(b => b.index.length > 50));

console.log("\n[2] 条目数与课次覆盖");
const cnt = T.map(b => b.index.length);
t("中级上 102 条", cnt[0] === 102, cnt[0]);
t("中级下 173 条", cnt[1] === 173, cnt[1]);
t("高级上 98 条", cnt[2] === 98, cnt[2]);
t("高级下 75 条", cnt[3] === 75, cnt[3]);
t("合计 448 条", cnt.reduce((a, b) => a + b, 0) === 448, cnt.reduce((a, b) => a + b, 0));
T.forEach(b => {
  const les = [...new Set(b.index.map(x => x[1]))];
  t(b.name + " 覆盖课次完整（" + les.length + " 课）", les.length === (b.id === "gjs" || b.id === "gjx" ? 12 : 16), les.length);
});

console.log("\n[3] 数据合法性");
t("条目均为非空字符串", T.every(b => b.index.every(([g]) => typeof g === "string" && g.length > 0)));
t("课次均为 1–32 的整数", T.every(b => b.index.every(([, n]) => Number.isInteger(n) && n >= 1 && n <= 32)));
t("中级上课次落在 1–16", T[0].index.every(([, n]) => n >= 1 && n <= 16));
t("中级下课次落在 17–32", T[1].index.every(([, n]) => n >= 17 && n <= 32));
t("高级上课次落在 1–12", T[2].index.every(([, n]) => n >= 1 && n <= 12));
t("高级下课次落在 13–24", T[3].index.every(([, n]) => n >= 13 && n <= 24));
t("无重复条目", T.every(b => new Set(b.index.map(x => x[0])).size === b.index.length));

console.log("\n[4] 按课次分组");
const gm = J.gramsByLesson(T[0]);
t("中级上分出 16 个课次", Object.keys(gm).length === 16, Object.keys(gm).length);
t("第 1 课有 4 条", gm[1].length === 4, gm[1].length);
t("第 1 课含「～とは」", gm[1].indexOf("～とは") >= 0, gm[1].join("、"));
t("第 16 课含「～一方、～」", gm[16].indexOf("～一方、～") >= 0);
t("分组总数 = 条目总数", Object.values(gm).reduce((a, b) => a + b.length, 0) === T[0].index.length);

console.log("\n[5] 课程信息");
t("中级上 4 个单元", T[0].units.length === 4);
t("单元主题正确", T[0].units[0].t.indexOf("金星") >= 0, T[0].units[0].t);
t("中级上 16 课标题", T[0].lessons.length === 16, T[0].lessons.length);
t("第1课会话信息完整", T[0].lessons[0].fn === "搭话·打招呼" && T[0].lessons[0].text === "日本の鉄道");
t("高级上 3 单元 12 课", T[2].units.length === 3 && T[2].lessons.length === 12);
t("高级下含第 4 单元（社会）", T[3].units[0].t === "社会");

console.log("\n[6] 视图输出");
const h = J.viewTextbook();
t("标题正确", h.indexOf("教材大纲") >= 0);
t("四个教材切换按钮", (h.match(/data-tbk="/g) || []).length === 4);
t("显示单元信息", h.indexOf("第1单元") >= 0 && h.indexOf("金星") >= 0);
t("按课次列出", h.indexOf("第 1 课") >= 0 && h.indexOf("第 16 课") >= 0);
t("显示语法条目", h.indexOf("～とは") >= 0);
t("显示条目统计", h.indexOf("102") >= 0, "应含 102 条");
t("有数据来源说明", h.indexOf("扫描件字迹") >= 0);

console.log("\n[7] 切换教材");
J.tb.cur = 2;
const h2 = J.viewTextbook();
t("切到高级上", h2.indexOf("高级上") >= 0 && h2.indexOf("风俗与习惯") >= 0);
t("高级上课次 1–12", h2.indexOf("第 12 课") >= 0 && h2.indexOf("第 13 课") < 0);
t("显示拓展专题", h2.indexOf("拓展") >= 0 && h2.indexOf("拟态词") >= 0);
J.tb.cur = 1;
const h3 = J.viewTextbook();
t("切到中级下（无课文标题也能渲染）", h3.indexOf("中级下") >= 0 && h3.indexOf("第 17 课") >= 0);
J.tb.cur = 0;

console.log("\n[8] 回归");
t("文章精读仍可用", J.READING.length >= 12, J.READING.length);
t("真人音索引 1040", Object.keys(globalThis.AUDIO_MAP).length === 1040);
t("变形 行く→行って", J.conj("いく", 1, "te") === "いって");
t("语法库原有 214 条", J.GRAMMAR.length >= 214, J.GRAMMAR.length);
t("学习/复习仍独立", J.ls !== J.rs);

console.log("\n结果：" + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);
