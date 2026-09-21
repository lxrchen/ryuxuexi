/* v20 验证：通读全文对「对话体文章」失效的修复 + 全遍历点防漏
 * 背景：v1.11.0 给精读加了 note（场景提示）字段，但 playAll 仍在用
 *      a.s[i].j.length —— note 没有 j，直接抛 TypeError，通读一句都不出声。
 *      用户反馈「整体的文章通读和慢读功能没起效」。
 * 运行：node jp_v20_verify.js（cwd = 日语学习站）
 */
const fs = require("fs");
let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra !== undefined ? "   → " + extra : "")); }
}
const els = {};
const mkEl = () => ({
  innerHTML: "", textContent: "", style: {}, value: "",
  addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
  focus() {}, click() {}, remove() {}, insertAdjacentHTML() {},
  querySelector() { return null; }, querySelectorAll() { return []; },
  classList: { _s: {}, toggle(n) { this._s[n] = !this._s[n]; }, add(n) { this._s[n] = true; }, remove(n) { delete this._s[n]; }, contains(n) { return !!this._s[n]; } },
  closest() { return null; }
});
const el = (s) => els[s] || (els[s] = mkEl());
const spoken = [];
globalThis.window = {
  addEventListener() {}, scrollTo() {},
  speechSynthesis: {
    getVoices: () => [{ name: "Google 日本語", lang: "ja-JP", voiceURI: "g-jp" }],
    cancel() {}, speak(u) { spoken.push({ text: u.text, rate: u.rate }); }
  }
};
globalThis.document = {
  addEventListener() {}, querySelector: el, querySelectorAll: () => [],
  getElementById: el, createElement: () => mkEl(), body: { appendChild() {} }
};
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } };
globalThis.location = { hash: "#/read" };
globalThis.Audio = function () { return { playbackRate: 1, src: "", play: () => Promise.resolve(), load() {} }; };
globalThis.SpeechSynthesisUtterance = function (txt) { this.text = txt; };
globalThis.URL = { createObjectURL: () => "x", revokeObjectURL() {} };
globalThis.Blob = function () {};
globalThis.navigator = {};
["data/kana.js", "data/vocab-n5.js", "data/vocab-n4.js", "data/vocab-n3.js", "data/vocab-n2.js",
  "data/vocab-n1.js", "data/vocab-zjc.js", "data/verbs.js", "data/grammar.js", "data/reading.js",
  "data/textbook.js", "data/audio-map.js", "app.js"].forEach((f) => eval(fs.readFileSync("js/" + f, "utf8")));
const J = globalThis.__JP__;
const S = J.state();
const R = J.READING;
const talk = R.filter((a) => a.s.some((x) => x.note));     // 含场景提示的对话体文章
const plain = R.filter((a) => !a.s.some((x) => x.note));   // 普通文章
const BASE_TTS = S.settings.ttsRate;
S.settings.audioMode = "tts";

console.log("\n[1] 前置：确认样本存在");
{
  t("存在对话体文章（含 note）", talk.length > 0, talk.length);
  t("存在普通文章", plain.length > 0, plain.length);
  const a = talk[0];
  t("对话体文章的首行确实是 note", !!a.s[0].note);
  t("realSentences 跳过 note", J.realSentences(a).length === a.s.filter((x) => x.j).length,
    J.realSentences(a).length + " vs " + a.s.filter((x) => x.j).length);
  t("realSentences 少于全部行数（确实过滤掉了）", J.realSentences(a).length < a.s.length,
    J.realSentences(a).length + " < " + a.s.length);
}

console.log("\n[2] 核心回归：通读对话体文章不再抛异常（曾经一句都不出声）");
{
  const a = talk[0];
  spoken.length = 0;
  let err = null;
  try { J.playAll(a); } catch (e) { err = e; }
  t("playAll 不抛异常", err === null, err && err.message);
  t("首句立即发声", spoken.length === 1, spoken.length);
  t("读的是第一句真实句子（不是场景提示）", spoken[0] && spoken[0].text === J.realSentences(a)[0].j,
    spoken[0] && spoken[0].text);
  t("没有把中文场景提示念出来", !spoken.some((x) => /飞机准点到达|（小李/.test(x.text || "")));
  J.playAll(a);   // 停止，清理定时器
}

console.log("\n[3] 通读的速率：正常 / 慢速");
{
  const a = talk[0];
  spoken.length = 0;
  J.playAll(a);
  t("正常通读：首句按基准速率", Math.abs(spoken[0].rate - BASE_TTS) < 1e-6, spoken[0].rate);
  J.playAll(a);
  spoken.length = 0;
  J.playAll(a, true);
  t("慢速通读：首句按 0.7 倍速", Math.abs(spoken[0].rate - BASE_TTS * 0.7) < 1e-6, spoken[0].rate);
  t("慢速确实更慢", spoken[0].rate < BASE_TTS);
  J.playAll(a);
}

console.log("\n[4] 通读的停止与回调");
{
  const a = talk[0];
  let ended = 0;
  spoken.length = 0;
  J.playAll(a, false, function () { ended++; });
  J.playAll(a, false, function () { ended++; });   // 第二次 = 停止
  t("播放中再次调用会停止并触发回调", ended === 1, ended);
  t("停止后定时器已清理（可再次启动）", (function () {
    spoken.length = 0;
    J.playAll(a);
    const ok = spoken.length === 1;
    J.playAll(a);
    return ok;
  })());
  // 空文章不应崩溃
  let err = null;
  try { J.playAll({ s: [] }, false, function () { ended++; }); } catch (e) { err = e; }
  t("空文章不抛异常且回调被调用", err === null && ended >= 2, err && err.message);
}

console.log("\n[5] 普通文章的通读不受影响");
{
  const a = plain[0];
  spoken.length = 0;
  let err = null;
  try { J.playAll(a); } catch (e) { err = e; }
  t("普通文章仍能通读", err === null && spoken.length === 1, err && err.message);
  t("读的是第一句", spoken[0].text === a.s[0].j);
  J.playAll(a);
}

console.log("\n[6] 单句朗读：对话体与普通文章都对");
{
  const a = talk[0];
  const noteIdx = a.s.findIndex((x) => x.note);
  const talkIdx = a.s.findIndex((x) => x.j);
  spoken.length = 0;
  J.saySentence(a, noteIdx);
  t("朗读场景提示 → 不出声", spoken.length === 0, spoken.length);
  spoken.length = 0;
  J.saySentence(a, talkIdx);
  t("朗读对话句 → 正常出声", spoken.length === 1 && spoken[0].text === a.s[talkIdx].j);
  spoken.length = 0;
  J.saySentence(a, talkIdx, true);
  t("慢速朗读对话句 → 0.7 倍速", Math.abs(spoken[0].rate - BASE_TTS * 0.7) < 1e-6, spoken[0].rate);
}

console.log("\n[7] 防漏：所有遍历 a.s 的公开函数对对话体都不抛异常");
{
  const a = talk[0];
  J.rd.cur = a;
  const cases = [
    ["readListHTML", function () { return J.readListHTML(); }],
    ["readStageHTML(阅读)", function () { return J.readStageHTML(a); }],
    ["blankStageHTML(填空)", function () { J.rd.bi = 0; J.rd.rev = false; return J.blankStageHTML(a); }],
    ["quizStageHTML(理解题)", function () { J.rd.qi = 0; J.rd.pick = -1; return J.quizStageHTML(a); }],
    ["blanksOf", function () { return J.blanksOf(a).join(","); }],
    ["viewRead(整页)", function () { J.rd.stage = "read"; return J.viewRead(); }]
  ];
  cases.forEach(function (c) {
    let err = null, out = "";
    try { out = c[1](); } catch (e) { err = e; }
    t(c[0] + " 不抛异常且有输出", err === null && String(out).length > 0, err && err.message);
  });
  J.rd.stage = "read";
}

console.log("\n[8] 句数显示不含场景提示");
{
  const a = talk[0];
  J.rd.lv = a.lv; J.rd.cur = null;
  const list = J.readListHTML();
  const real = J.realSentences(a).length;
  // 按 data-rdopen 定位到该文章自己的显示片段（在整个列表里搜「N 句」会误命中别的文章）
  const i = list.indexOf('data-rdopen="' + a.id + '"');
  const seg = i >= 0 ? list.slice(i, i + 400) : "";
  t("能在列表里定位到该文章", i >= 0);
  t("显示的是真实句数（" + real + "）", seg.indexOf(real + " 句") >= 0, (seg.match(/\d+ 句/) || [])[0]);
  t("不把场景提示算进句数（原文 " + a.s.length + " 行）", a.s.length === real || seg.indexOf(a.s.length + " 句") < 0,
    (seg.match(/\d+ 句/) || [])[0]);
}

console.log("\n[9] 全库遍历：每一篇都过一遍通读（穷举防漏）");
{
  let err = null, bad = [];
  R.forEach(function (a) {
    try {
      const list = J.realSentences(a);
      if (!list.length) bad.push(a.id + " 无真实句子");
      list.forEach(function (x) { if (typeof x.j !== "string" || !x.j) bad.push(a.id + " 句子异常"); });
    } catch (e) { err = e; }
  });
  t("全库 realSentences 正常", err === null && bad.length === 0, (err && err.message) || bad.slice(0, 3).join("; "));
  let crash = null;
  try {
    R.forEach(function (a) { J.playAll(a); J.playAll(a); });   // 启动后立即停止，只验证不崩
  } catch (e) { crash = e; }
  t("全库逐篇调用 playAll 不崩", crash === null, crash && crash.message);
}

console.log("\n[10] 其他功能未被破坏");
{
  t("慢速倍率仍在", J.SLOW_RATE === 0.7);
  t("听写判分可用", J.matchWord({ k: "ねこ", w: "猫" }, "猫") === true);
  t("四种卡片方向（含自动进阶）", J.CARD_MODES.length === 4 && J.CARD_MODES[0][0] === "auto");
  t("学习步进仍在", J.LEARN_STEPS.length === 2);
  t("文章数据自检通过", R.every((a) => a.s.every((x) => x.note || (x.j && x.k && x.z))));
  t("挖空答案仍在原句中", R.every((a) => a.s.every((x) => !x.b || (x.j.indexOf(x.b.a) >= 0 && x.j.split(x.b.a).length - 1 === 1))));
  S.settings.audioMode = "auto";
}

console.log("\n───────────────");
console.log("v20 结果：" + pass + "/" + (pass + fail) + " 通过" + (fail ? "，" + fail + " 失败" : ""));
process.exit(fail ? 1 : 0);
