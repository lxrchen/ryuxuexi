/* v11 验证：文章精读（阅读 / 填空 / 理解题） */
const fs = require("fs");
const P = "C:/Users/Chen/Desktop/个人/日语学习站/js/";

const stub = () => ({
  innerHTML: "", style: {}, value: "", files: null,
  addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
  focus() {}, querySelector() { return null; }, querySelectorAll() { return []; },
  classList: { toggle() {}, add() {}, remove() {} }, closest() { return null; },
  click() {}, remove() {}, insertAdjacentHTML() {}
});
let resHTML = "";
const resBox = { set innerHTML(v) { resHTML = v; }, get innerHTML() { return resHTML; } };
global.Audio = function () { return { src: "", play: () => Promise.resolve(), load() {} }; };
global.window = { addEventListener() {}, scrollTo() {}, speechSynthesis: { getVoices: () => [], cancel() {}, speak() {} } };
global.document = {
  addEventListener() {}, querySelectorAll: () => [],
  querySelector(sel) { if (sel === "#rdres") return resBox; return stub(); },
  getElementById: () => stub(), createElement: () => stub(), body: { appendChild() {} }
};
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.location = { hash: "#/read" };
global.SpeechSynthesisUtterance = function () {};
global.URL = { createObjectURL: () => "blob:x", revokeObjectURL() {} };
global.Blob = function () {};

["data/kana.js", "data/vocab-n5.js", "data/vocab-n4.js", "data/vocab-n3.js", "data/vocab-n2.js",
 "data/vocab-n1.js", "data/verbs.js", "data/grammar.js", "data/reading.js", "data/audio-map.js", "app.js"]
  .forEach(f => eval(fs.readFileSync(P + f, "utf8")));

const J = globalThis.__JP__;
let pass = 0, fail = 0;
const t = (name, cond, extra) => { if (cond) { pass++; console.log("  ok   " + name); } else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  → " + extra : "")); } };

const R = J.READING;
const S = J.state();
const rd = J.rd;
const art = R[0];   // 私の一日

console.log("\n[1] 数据加载");
t("文章 ≥12 篇（含教材课文）", R.length >= 12, R.length);
t("N5 至少 8 篇（已扩充含教材课文）", R.filter(a => a.lv === "N5").length >= 8, R.filter(a => a.lv === "N5").length);
t("N4 至少 4 篇（已扩充）", R.filter(a => a.lv === "N4").length >= 4, R.filter(a => a.lv === "N4").length);
t("每句都有假名与翻译（场景提示行除外）", R.every(a => a.s.every(s => s.note || (s.j && s.k && s.z))));
t("每篇都有理解题", R.every(a => a.q.length > 0));
t("每篇至少一处挖空", R.every(a => a.s.some(s => s.b)));

console.log("\n[2] 挖空定位");
const bs = J.blanksOf(art);
t("第一篇 3 处挖空", bs.length === 3, bs.length);
t("挖空索引合法", bs.every(i => art.s[i] && art.s[i].b));
t("无挖空的文章返回空数组", J.blanksOf({ s: [{ j: "a" }, { j: "b" }] }).length === 0);

console.log("\n[3] 填空判分（宽松匹配）");
const b1 = art.s[bs[0]].b;   // 六時 / ろくじ
t("汉字答案正确", J.matchBlank(b1, "六時") === true);
t("假名答案正确", J.matchBlank(b1, "ろくじ") === true);
t("带空格容错", J.matchBlank(b1, " 六時 ") === true);
t("错误答案判错", J.matchBlank(b1, "七時") === false);
t("空答案判错", J.matchBlank(b1, "") === false);

console.log("\n[4] 阅读视图");
rd.lv = "N5"; rd.cur = null;
let h = J.viewRead();
t("未选文章时显示列表", h.indexOf("文章精读") >= 0 && h.indexOf("私の一日") >= 0);
t("列表显示句数/空数/题数", h.indexOf("句 ·") >= 0 && h.indexOf("空 ·") >= 0);
t("列表可点开文章", h.indexOf('data-rdopen="rd-n5-1"') >= 0);

rd.cur = art;
h = J.viewRead();
t("阅读页有标题与中文", h.indexOf("私の一日") >= 0 && h.indexOf("我的一天") >= 0);
t("默认显示假名", h.indexOf("わたしは まいあさ") >= 0);
t("默认不显示中文对照", h.indexOf("我每天早上六点起床") < 0);
rd.showZ = true;
h = J.viewRead();
t("开启后显示中文", h.indexOf("我每天早上六点起床") >= 0);
rd.showZ = false;
t("显示语法标注", h.indexOf("に（时间点）") >= 0);
t("每句有朗读按钮", (h.match(/data-rsay="/g) || []).length === art.s.length, (h.match(/data-rsay="/g) || []).length);
t("有通读全文按钮", h.indexOf('id="rdplayall"') >= 0);
t("可切到填空/理解题", h.indexOf('data-rdstage="blank"') >= 0 && h.indexOf('data-rdstage="quiz"') >= 0);

console.log("\n[5] 填空视图与流程");
rd.stage = "blank"; rd.bi = 0; rd.br = 0; rd.bw = 0;
h = J.blankStageHTML(art);
t("显示第 1/3 空", h.indexOf("第 <b>1</b>") >= 0 && h.indexOf("/ 3 空") >= 0);
t("题面已挖空", h.indexOf('class="blank"') >= 0 && h.indexOf("六時") < 0, "挖空处应显示 ____");
t("给出提示", h.indexOf("时间：几点") >= 0);
t("有输入框与提交", h.indexOf('id="rdin"') >= 0 && h.indexOf('id="rdok"') >= 0);
// 模拟提交正确
rd.br = 1; rd.bi = 1;
h = J.blankStageHTML(art);
t("下一空题面正确", h.indexOf("洗う 的て形") >= 0);
t("进度正确显示 2/3", h.indexOf("第 <b>2</b>") >= 0);
// 走完
rd.br = 2; rd.bw = 1; rd.bi = 3;
h = J.blankStageHTML(art);
t("完成态显示正确率", h.indexOf("填空完成") >= 0 && h.indexOf("67%") >= 0, h.indexOf("填空完成") >= 0 ? "有完成态" : "无");
t("完成后写入进度", !!S.reading[art.id], JSON.stringify(S.reading[art.id]));
t("进度含 blank 计数", S.reading[art.id].blank.r === 2 && S.reading[art.id].blank.w === 1);
t("引导去做理解题", h.indexOf('data-rdstage="quiz"') >= 0);

console.log("\n[6] 理解题流程");
rd.stage = "quiz"; rd.qi = 0; rd.qr = 0; rd.qw = 0; rd.pick = -1;
h = J.quizStageHTML(art);
t("显示第 1 题", h.indexOf("第 <b>1</b>") >= 0 && h.indexOf("/ 2 题") >= 0);
t("显示问题与 3 个选项", h.indexOf("私は何時に起きますか") >= 0 && (h.match(/data-rdopt="/g) || []).length === 3);
t("未作答时不显示解析", h.indexOf("文中说") < 0);
rd.pick = 0;   // 正确答案
h = J.quizStageHTML(art);
t("答对显示 ✓", h.indexOf("✓ 正确") >= 0);
t("显示解析", h.indexOf("文中说") >= 0);
rd.pick = 1; rd.qr = 0; rd.qw = 1;
h = J.quizStageHTML(art);
t("答错显示正确答案", h.indexOf("✗ 正确答案") >= 0 && h.indexOf("六時") >= 0);
rd.qi = 2; rd.qr = 1; rd.qw = 1;
h = J.quizStageHTML(art);
t("完成态显示正确率 50%", h.indexOf("理解题完成") >= 0 && h.indexOf("50%") >= 0);
t("进度含 quiz 计数", S.reading[art.id].quiz.r === 1 && S.reading[art.id].quiz.w === 1);

console.log("\n[7] 未挖空/无题保护");
t("无挖空文章给出提示", J.blankStageHTML({ s: [{ j: "あ" }] }).indexOf("没有设置填空") >= 0);
t("无题文章给出提示", J.quizStageHTML({ q: [] }).indexOf("没有理解题") >= 0);

console.log("\n[8] 回归");
t("真人音索引 1040", Object.keys(globalThis.AUDIO_MAP).length === 1040);
t("变形 行く→行って", J.conj("いく", 1, "te") === "いって");
t("听写判分", J.matchWord({ k: "がくせい", w: "学生" }, "学生") === true);
t("复习/学习仍独立", J.ls !== J.rs);
t("自定义词库可用", typeof J.addCustom === "function");

console.log("\n结果：" + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);
