/* v18 验证：正常/慢速双速朗读 + 精读文章扩充
 * 背景：① 用户要「正常读速 / 慢速」两种，练听力
 *      ② 精读文章太少（原 12 篇原创 + 1 篇教材）
 * 运行：node jp_v18_verify.js（cwd = 日语学习站）
 */
const fs = require("fs");
let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra !== undefined ? "   → " + extra : "")); }
}
/* ---------- 环境 ---------- */
const els = {};
const mkEl = () => ({
  innerHTML: "", textContent: "", style: {}, value: "",
  addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
  focus() {}, click() {}, remove() {}, insertAdjacentHTML() {},
  querySelector() { return null; }, querySelectorAll() { return []; },
  classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
  closest() { return null; }
});
const el = (s) => els[s] || (els[s] = mkEl());
const spoken = [];                     // 捕获所有朗读
const audios = [];                     // 捕获所有音频播放
globalThis.window = {
  addEventListener() {}, scrollTo() {},
  speechSynthesis: {
    getVoices: () => [{ name: "Google 日本語", lang: "ja-JP", voiceURI: "g-jp", localService: false }],
    cancel() {},
    speak(u) { spoken.push({ text: u.text, rate: u.rate }); }
  }
};
globalThis.document = {
  addEventListener() {}, querySelector: el, querySelectorAll: () => [],
  getElementById: el, createElement: () => mkEl(), body: { appendChild() {} }
};
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } };
globalThis.location = { hash: "#/read" };
globalThis.Audio = function () {
  const a = { playbackRate: 1, src: "", play: () => Promise.resolve(), load() {}, onerror: null, onstalled: null, oncanplay: null, onended: null };
  audios.push(a); return a;
};
globalThis.SpeechSynthesisUtterance = function (txt) { this.text = txt; };
globalThis.URL = { createObjectURL: () => "x", revokeObjectURL() {} };
globalThis.Blob = function () {};
globalThis.navigator = {};
["data/kana.js", "data/vocab-n5.js", "data/vocab-n4.js", "data/vocab-n3.js", "data/vocab-n2.js",
  "data/vocab-n1.js", "data/vocab-zjc.js", "data/verbs.js", "data/grammar.js", "data/reading.js",
  "data/textbook.js", "data/audio-map.js", "app.js"].forEach((f) => eval(fs.readFileSync("js/" + f, "utf8")));
const J = globalThis.__JP__;
const S = J.state();
const BASE_TTS = S.settings.ttsRate;     // 默认 0.9
const BASE_HUMAN = S.settings.humanRate; // 默认 1

console.log("\n[1] TTS 支持显式语速倍率");
{
  S.settings.audioMode = "tts";          // 排除真人音干扰
  spoken.length = 0;
  J.tts("こんにちは");
  t("正常速：rate = ttsRate", Math.abs(spoken[0].rate - BASE_TTS) < 1e-6, spoken[0].rate);
  spoken.length = 0;
  J.tts("こんにちは", 0.7);
  t("慢速：rate 按倍率降低", Math.abs(spoken[0].rate - BASE_TTS * 0.7) < 1e-6, spoken[0].rate);
  t("慢速确实更慢", spoken[0].rate < BASE_TTS);
}

console.log("\n[2] 真人音也支持慢速（playbackRate）");
{
  S.settings.audioMode = "auto";
  const v = J.VOCAB.N5.filter((x) => J.hasHuman(x.w, x.k))[0];
  if (!v) { t("（无真人音样本，跳过）", true); }
  else {
    audios.length = 0;
    J.speak(v.k, { kanji: v.w, kana: v.k });
    t("正常速播放真人音", Math.abs(audios[audios.length - 1].playbackRate - BASE_HUMAN) < 1e-6, audios[audios.length - 1].playbackRate);
    J.speak(v.k, { kanji: v.w, kana: v.k, mul: 0.7 });   // Audio 元素是复用的，不要清空数组
    t("慢速播放真人音（按 playbackRate 降速）", Math.abs(audios[audios.length - 1].playbackRate - BASE_HUMAN * 0.7) < 1e-6, audios[audios.length - 1].playbackRate);
  }
}

console.log("\n[3] 句子朗读：正常 / 慢速");
{
  const a = J.READING[0];
  spoken.length = 0;
  J.saySentence(a, 0);
  t("正常：按基准速率朗读", Math.abs(spoken[0].rate - BASE_TTS) < 1e-6, spoken[0].rate);
  spoken.length = 0;
  J.saySentence(a, 0, true);
  t("慢速：按 0.7 倍速朗读", Math.abs(spoken[0].rate - BASE_TTS * 0.7) < 1e-6, spoken[0].rate);
  t("读的是这一句", spoken[0].text === a.s[0].j, spoken[0].text && spoken[0].text.slice(0, 20));
}

console.log("\n[4] 通读全文的慢速（第一句就应是慢速）");
{
  const a = J.READING[0];
  spoken.length = 0;
  J.playAll(a, true);
  t("慢速通读：首句按 0.7 倍速", spoken.length > 0 && Math.abs(spoken[0].rate - BASE_TTS * 0.7) < 1e-6, spoken[0] && spoken[0].rate);
  J.playAll(a);                          // 关闭定时器
  spoken.length = 0;
  J.playAll(a);
  t("正常通读：首句按基准速率", spoken.length > 0 && Math.abs(spoken[0].rate - BASE_TTS) < 1e-6, spoken[0] && spoken[0].rate);
  J.playAll(a);
}

console.log("\n[5] playWord 不再临时改全局设置（旧写法会串）");
{
  const rateBefore = S.settings.ttsRate;
  const v = J.VOCAB.N5[0];
  S.settings.audioMode = "tts";
  spoken.length = 0;
  J.playWord(v, true);
  J.playWord(v, false);                  // 紧接着正常速朗读一次
  t("慢速调用没有改动 ttsRate", S.settings.ttsRate === rateBefore, S.settings.ttsRate);
  t("两次调用的速率各自独立", Math.abs(spoken[0].rate - rateBefore * 0.7) < 1e-6 && Math.abs(spoken[1].rate - rateBefore) < 1e-6,
    spoken.map((x) => x.rate).join(" / "));
  t("没有用到延时恢复设置", spoken.length === 2, spoken.length);
  S.settings.audioMode = "auto";
}

console.log("\n[6] 精读页面的慢速入口");
{
  const a = J.READING[0];
  J.rd.lv = a.lv; J.rd.cur = a; J.rd.stage = "read";
  const h = J.readStageHTML(a);
  t("每句有「正常」朗读按钮", h.indexOf('data-rsay="0"') >= 0);
  t("每句有「慢」按钮", h.indexOf('data-rslow="0"') >= 0);
  t("慢速按钮带 slow 样式类", h.indexOf("rsay slow") >= 0);
  t("最后一句也有慢速按钮", h.indexOf('data-rslow="' + (a.s.length - 1) + '"') >= 0);
  t("提供正常速通读", h.indexOf('id="rdplayall"') >= 0);
  t("提供慢速通读", h.indexOf('id="rdplayallslow"') >= 0);
  t("写明「慢速听清后要回到正常速」的练法", h.indexOf("回到正常速度") >= 0);
  // 填空练习也有慢速
  const bs = J.blanksOf(a);
  J.rd.bi = 0;
  const hb = J.blankStageHTML(a);
  t("填空练习也提供慢速听", hb.indexOf("rdplaycurslow") >= 0);
}

console.log("\n[7] 卡片听音模式也有慢速重听");
{
  S.settings.cardMode = "listen"; S.settings.cardKana = true;
  J.setStateFor("learn");
  const st = J.ls; st.lv = "N5"; st.src = ""; st.lesson = 0;
  J.buildQueue(true); st.idx = 0; st.show = false;
  J.renderCard();
  const h = els["#vcard"].innerHTML;
  t("听音模式正面有慢速重听按钮", h.indexOf("vsay4") >= 0);
  t("保留大按钮（正常速重听）", h.indexOf("bigsay") >= 0);
  S.settings.cardMode = "word";
}

console.log("\n[8] 文章数量与数据完整性");
{
  const R = J.READING;
  const by = {}; R.forEach((a) => { by[a.lv] = (by[a.lv] || 0) + 1; });
  t("文章总数 ≥ 20", R.length >= 20, R.length);
  t("N5 有 8 篇", by.N5 >= 8, by.N5);
  t("N4 ≥ 8 篇（原 4）", by.N4 >= 8, by.N4);
  t("N3 ≥ 6 篇（原 1）", by.N3 >= 6, by.N3);
  t("总句数 ≥ 130", R.reduce((s, a) => s + a.s.length, 0) >= 130, R.reduce((s, a) => s + a.s.length, 0));

  let bad = [];
  R.forEach((a) => {
    if (!a.id || !a.lv || !a.t || !a.zh || !a.s || !a.s.length || !a.q || !a.q.length) bad.push(a.id + " 字段缺失");
    a.s.forEach((x, i) => {
      if (x.note) return;                      // 对话体的场景提示行没有日文/假名/译文
      if (!x.j || !x.k || !x.z) bad.push(a.id + " 第" + (i + 1) + "句缺字段");
      if (x.b) {
        if (!x.b.a || !x.b.k) bad.push(a.id + " 挖空缺字段");
        if (x.j.indexOf(x.b.a) < 0) bad.push(a.id + " 挖空答案不在句中：" + x.b.a);
        if (x.j.split(x.b.a).length - 1 > 1) bad.push(a.id + " 挖空答案重复：" + x.b.a);
      }
    });
    a.q.forEach((q, i) => {
      if (q.a < 0 || q.a >= q.o.length) bad.push(a.id + " 理解题索引越界");
      if (!q.z) bad.push(a.id + " 理解题缺解析");
    });
  });
  t("全部文章数据自检通过", bad.length === 0, bad.slice(0, 3).join("; "));
  t("id 无重复", new Set(R.map((a) => a.id)).size === R.length);

  // 新文章必须能正常渲染
  const n3 = R.filter((a) => a.lv === "N3" && a.id !== "rd-zjc-1");
  J.rd.lv = "N3"; J.rd.cur = n3[0]; J.rd.stage = "read";
  const h = J.readStageHTML(n3[0]);
  t("新 N3 文章可渲染阅读态", h.indexOf(n3[0].s[0].j) >= 0 && h.indexOf(n3[0].s[0].k) >= 0, (h.match(/class="rj jp">[^<]*/) || [])[0]);
  J.rd.stage = "blank"; J.rd.bi = 0; J.rd.rev = false;
  t("新 N3 文章可渲染填空态", J.blankStageHTML(n3[0]).length > 100);
  J.rd.stage = "quiz"; J.rd.qi = 0; J.rd.pick = -1;
  t("新 N3 文章可渲染理解题", J.quizStageHTML(n3[0]).indexOf(n3[0].q[0].q) >= 0);
  J.rd.cur = null; J.rd.stage = "read";
}

console.log("\n[9] 其他功能未被破坏");
{
  t("单词卡五种方向（含自动进阶）", J.CARD_MODES.length === 5 && J.CARD_MODES[0][0] === "auto");
  t("学习步进仍在", J.LEARN_STEPS.length === 2);
  t("听写判分可用", J.matchWord({ k: "ねこ", w: "猫" }, "猫") === true);
  t("挖空判分可用", (function () {
    const a = J.READING.filter((x) => x.from)[0] || J.READING[0];
    const bs = J.blanksOf(a);
    return bs.length > 0;
  })());
  t("教材大纲数据仍在", J.TEXTBOOK.length > 0);
  t("全局 ttsRate / humanRate 未被改动", S.settings.ttsRate === BASE_TTS && S.settings.humanRate === BASE_HUMAN);
}

console.log("\n───────────────");
console.log("v18 结果：" + pass + "/" + (pass + fail) + " 通过" + (fail ? "，" + fail + " 失败" : ""));
process.exit(fail ? 1 : 0);
