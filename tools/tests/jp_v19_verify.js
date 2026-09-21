/* v19 验证：对话体课文（说话人 / 场景提示）+ 初级教材课文接入
 * 背景：用户要求把 N5/N4 的教材课文也提取进精读；
 *      会話是对话体，需要区分说话人与场景提示。
 * 运行：node jp_v19_verify.js（cwd = 日语学习站）
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
  classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
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
const R = J.READING;

console.log("\n[1] 对话体数据完整性（初级教材课文）");
{
  const talk = R.filter((a) => a.id.indexOf("rd-cs-") === 0);
  t("初级上课文已接入 ≥ 4 篇", talk.length >= 4, talk.length);
  t("都标注了教材来源", talk.every((a) => a.from && a.from.indexOf("初级上") >= 0));
  t("都是 N5", talk.every((a) => a.lv === "N5"));
  t("每篇都有说话人字段", talk.every((a) => a.s.some((x) => x.sp)));
  t("每篇都有场景提示", talk.every((a) => a.s.some((x) => x.note)));
  t("每篇都有理解题", talk.every((a) => a.q.length >= 2));
  t("每篇都有挖空", talk.every((a) => a.s.some((x) => x.b)));

  let bad = [];
  talk.forEach((a) => {
    a.s.forEach((x, i) => {
      if (x.note) { if (!String(x.note).trim()) bad.push(a.id + " 空提示"); return; }
      if (!x.j || !x.k || !x.z) bad.push(a.id + " 第" + (i + 1) + "条缺字段");
      if (x.sp === undefined) bad.push(a.id + " 第" + (i + 1) + "条无说话人");
      if (x.b) {
        if (x.j.indexOf(x.b.a) < 0) bad.push(a.id + " 挖空不在原句：" + x.b.a);
        if (x.j.split(x.b.a).length - 1 > 1) bad.push(a.id + " 挖空重复：" + x.b.a);
      }
    });
    a.q.forEach((q) => { if (q.a < 0 || q.a >= q.o.length) bad.push(a.id + " 理解题索引越界"); });
  });
  t("对话体数据自检通过", bad.length === 0, bad.slice(0, 3).join("; "));
}

console.log("\n[2] 阅读态渲染：说话人 / 场景提示");
{
  const a = R.find((x) => x.id === "rd-cs-1");
  J.rd.cur = a; J.rd.stage = "read"; J.rd.showK = true; J.rd.showZ = true;
  const h = J.readStageHTML(a);
  const noteN = a.s.filter((x) => x.note).length;
  const talkN = a.s.filter((x) => x.sp).length;
  t("场景提示渲染为 rnote", (h.match(/class="rnote"/g) || []).length === noteN, (h.match(/class="rnote"/g) || []).length + " vs " + noteN);
  t("对话句渲染为 rline", (h.match(/class="rline"/g) || []).length === talkN, (h.match(/class="rline"/g) || []).length + " vs " + talkN);
  t("说话人渲染为 rsp", (h.match(/class="rsp"/g) || []).length === talkN);
  t("说话人内容正确（李/小野/森）", h.indexOf(">李</span>") >= 0 && h.indexOf(">小野</span>") >= 0 && h.indexOf(">森</span>") >= 0);
  t("每个对话句都有正常+慢速按钮", (h.match(/data-rsay=/g) || []).length === talkN && (h.match(/data-rslow=/g) || []).length === talkN);
}

console.log("\n[3] 序号不把场景提示算进去（曾经的显示 bug）");
{
  const a = R.find((x) => x.id === "rd-cs-1");
  J.rd.cur = a; J.rd.stage = "read";
  const h = J.readStageHTML(a);
  const nums = (h.match(/class="rnum">(\d+)</g) || []).map((x) => parseInt(x.replace(/\D+/g, ""), 10));
  const talkN = a.s.filter((x) => x.sp).length;
  t("序号从 1 开始", nums[0] === 1, nums[0]);
  t("序号连续到实际句数", nums[nums.length - 1] === talkN, nums[nums.length - 1] + " vs " + talkN);
  t("序号个数 = 对话句数", nums.length === talkN, nums.length + " vs " + talkN);
}

console.log("\n[4] 场景提示不朗读");
{
  const a = R.find((x) => x.id === "rd-cs-1");
  const noteIdx = a.s.findIndex((x) => x.note);
  spoken.length = 0;
  J.saySentence(a, noteIdx);
  t("朗读场景提示时不会念出文字", spoken.length === 0, spoken.length);
  const firstTalk = a.s.findIndex((x) => x.sp);
  spoken.length = 0;
  J.saySentence(a, firstTalk);
  t("朗读对话句正常发声", spoken.length === 1 && spoken[0].text === a.s[firstTalk].j, spoken[0] && spoken[0].text);
}

console.log("\n[5] 填空练习：说话人保留、场景提示不参与");
{
  const a = R.find((x) => x.id === "rd-cs-1");
  const bs = J.blanksOf(a);
  t("挖空只出现在对话句上", bs.every((i) => a.s[i].sp !== undefined && !a.s[i].note), bs.join(","));
  J.rd.cur = a; J.rd.stage = "blank"; J.rd.bi = 0; J.rd.rev = false;
  const hb = J.blankStageHTML(a);
  t("填空态显示说话人", hb.indexOf('class="rsp"') >= 0);
  t("填空态有慢速听", hb.indexOf("rdplaycurslow") >= 0);
}

console.log("\n[6] 原有非对话体文章仍然正常（不能因新格式而坏）");
{
  const plain = R.find((x) => !x.from);
  t("存在非对话体文章", !!plain);
  J.rd.cur = plain; J.rd.stage = "read"; J.rd.showK = true;
  const h = J.readStageHTML(plain);
  t("普通文章不出现 rnote", h.indexOf('class="rnote"') < 0);
  t("普通文章不出现 rsp", h.indexOf('class="rsp"') < 0);
  t("普通文章句子照常渲染", (h.match(/class="rline"/g) || []).length === plain.s.length);
  J.rd.stage = "blank"; J.rd.bi = 0; J.rd.rev = false;
  t("普通文章填空照常", J.blankStageHTML(plain).length > 100);
  J.rd.stage = "quiz"; J.rd.qi = 0; J.rd.pick = -1;
  t("普通文章理解题照常", J.quizStageHTML(plain).indexOf(plain.q[0].q) >= 0);
}

console.log("\n[7] 全库数据自检");
{
  const by = {}; R.forEach((a) => { by[a.lv] = (by[a.lv] || 0) + 1; });
  t("N5 篇数 ≥ 20（8 原创 + 初级上教材课文）", by.N5 >= 20, by.N5);
  t("总篇数 ≥ 34", R.length >= 34, R.length);
  let bad = [];
  R.forEach((a) => {
    if (!a.id || !a.lv || !a.t || !a.zh || !a.s || !a.s.length || !a.q || !a.q.length) bad.push(a.id + " 字段缺失");
    a.s.forEach((x) => {
      if (x.note) return;
      if (!x.j || !x.k || !x.z) bad.push(a.id + " 句子缺字段");
      if (x.b && (x.j.indexOf(x.b.a) < 0 || x.j.split(x.b.a).length - 1 > 1)) bad.push(a.id + " 挖空问题：" + x.b.a);
    });
    a.q.forEach((q) => { if (q.a < 0 || q.a >= q.o.length || !q.z) bad.push(a.id + " 理解题问题"); });
  });
  t("全部文章自检通过", bad.length === 0, bad.slice(0, 3).join("; "));
  t("id 唯一", new Set(R.map((a) => a.id)).size === R.length);
  const seen = {}, dup = [];
  // 只查「实质长句」的跨篇重复（防止整段照抄）；短寒暄如「そうですか。」在教材对话里
  // 必然反复出现，属正常语言现象，不该报错。
  R.forEach((a) => a.s.forEach((x) => {
    if (x.j && x.j.length >= 10) { if (seen[x.j]) dup.push(a.id); else seen[x.j] = a.id; }
  }));
  t("跨篇无重复句子", dup.length === 0, dup.join(", "));
  t("教材课文总数 ≥ 5", R.filter((a) => a.from).length >= 5, R.filter((a) => a.from).length);
  // 初级上教材课文已接入的课次必须齐全（缺课说明录入中断，容易被忽略）
  {
    const missing = [];
    for (let n = 1; n <= 12; n++) if (!R.some((a) => a.id === "rd-cs-" + n)) missing.push(n);
    t("初级上课文 1–12 齐全", missing.length === 0, "缺：" + missing.join(","));
  }
}

console.log("\n[8] 其他功能未被破坏");
{
  t("慢速倍率仍在", J.SLOW_RATE === 0.7);
  t("听写判分可用", J.matchWord({ k: "ねこ", w: "猫" }, "猫") === true);
  t("四种卡片方向（含自动进阶）", J.CARD_MODES.length === 4 && J.CARD_MODES[0][0] === "auto");
  t("学习步进仍在", J.LEARN_STEPS.length === 2);
  t("教材大纲仍在", J.TEXTBOOK.length > 0);
  t("文章列表可渲染", J.readListHTML().length > 100);
}

console.log("\n───────────────");
console.log("v19 结果：" + pass + "/" + (pass + fail) + " 通过" + (fail ? "，" + fail + " 失败" : ""));
process.exit(fail ? 1 : 0);
