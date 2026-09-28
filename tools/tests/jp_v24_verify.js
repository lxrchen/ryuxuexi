/* v24 验证：客观作答 + 自动判分（撤掉四档自评）+ 麦克风发音练习
 *
 * 用户：「复习类功能应该是选词的意思通过正确与否来判断你是否成功记住这个词，
 *        而不是通过现在的四个选项来做记录」
 *       → 确认采用「混合制」：低熟练度四选一、熟练后动手输入；学习页与复习页都改。
 *
 * 为什么不是全用四选一：四选一是**再认**，比**回忆**容易得多。
 * 一直用它，SRS 会高估记忆、把间隔拉长，反而不牢 —— 所以熟练后要回到输入。
 * 运行：node tools/tests/jp_v24_verify.js（cwd = 日语学习站）
 */
const fs = require("fs");
let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra !== undefined ? "   → " + extra : "")); }
}
const els = {};
const mkEl = () => ({
  innerHTML: "", textContent: "", style: {}, value: "", selectionStart: 0, tagName: "DIV",
  addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
  focus() {}, click() {}, remove() {}, insertAdjacentHTML() {}, removeAttribute() {},
  setSelectionRange() {}, querySelector() { return null; }, querySelectorAll() { return []; },
  classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
  closest() { return null; }
});
const el = (s) => els[s] || (els[s] = mkEl());
const handlers = {};
globalThis.window = {
  addEventListener() {}, scrollTo() {},
  speechSynthesis: { getVoices: () => [], cancel() {}, speak() {} }
};
globalThis.document = {
  addEventListener(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
  querySelector: el, querySelectorAll: () => [],
  getElementById: el, createElement: () => mkEl(), body: { appendChild() {} }
};
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } };
globalThis.location = { hash: "#/learn" };
globalThis.Audio = function () { return { play: () => Promise.resolve(), load() {} }; };
globalThis.SpeechSynthesisUtterance = function () {};
globalThis.URL = { createObjectURL: () => "x", revokeObjectURL() {} };
globalThis.Blob = function () {};
globalThis.navigator = {};
["data/kana.js", "data/vocab-n5.js", "data/vocab-n4.js", "data/vocab-n3.js", "data/vocab-n2.js",
  "data/vocab-n1.js", "data/vocab-zjc.js", "data/verbs.js", "data/grammar.js", "data/reading.js",
  "data/textbook.js", "data/audio-map.js", "app.js"].forEach((f) => eval(fs.readFileSync("js/" + f, "utf8")));
const J = globalThis.__JP__;
const S = J.state();

function fakeTarget(attrs, id) {
  const a = attrs || {};
  const self = {
    id: id || "", tagName: "BUTTON",
    getAttribute(n) { return a[n] !== undefined ? a[n] : null; },
    closest(sel) {
      if (sel === "button") return self;
      const m = /^\[(.+)\]$/.exec(sel);
      if (m && a[m[1]] !== undefined) return self;
      return null;
    },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    removeAttribute() {}, setSelectionRange() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    remove() {}, insertAdjacentHTML() {}, focus() {}, click() {}
  };
  return self;
}
function click(attrs, id) { (handlers.click || []).forEach((fn) => fn({ target: fakeTarget(attrs, id) })); }
const cardHTML = () => els["#vcard"].innerHTML || "";
/* 正反面在同一个 HTML 串里（靠 CSS 翻转）→ 断言「正面没有 X」必须按 cback 切分 */
const frontOf = (x) => x.slice(0, x.indexOf("cback"));

/* 把指定词摆成当前卡片（kind: "learn" / "review"）
   走正规入口 J.render()：卡片页的队列只在「进入页面 / 跨天」时重建，
   绕过它会让后续 render() 触发重建、把 idx 归零（那是测试写法问题，不是产品行为）。 */
function cardFor(v, rec, mode, kind) {
  S.cards = {}; S.wrong = []; S.today = { date: "", new: 0, rev: 0 };
  S.settings.cardMode = mode || "word"; S.settings.cardKana = true;
  const isRev = kind === "review";
  globalThis.location.hash = isRev ? "#/review" : "#/learn";
  J.setStateFor(isRev ? "review" : "learn");
  const st = isRev ? J.rs : J.ls;
  st.lv = v.lv; st.src = ""; st.lesson = 0; st.ch = null; st.show = false; st.rmode = "due";
  if (rec) S.cards[v.id] = JSON.parse(JSON.stringify(rec));
  J.render();
  let i = st.queue.findIndex(function (x) { return x.id === v.id; });
  if (i < 0) { st.queue.unshift(v); i = 0; }      // 队列里没有就塞队首，保证测的是这个词
  st.idx = i; st.show = false; st.ch = null;
  J.renderCard();
  return st;
}
/* 四选一：选正确项 / 选一个错项 */
function pickCorrect(v) {
  const o = J.vs.ch.opts[J.vs.ch.idx];
  click({ "data-copt": String(o.findIndex(function (x) { return x.id === v.id; })) });
}
function pickWrong(v) {
  const o = J.vs.ch.opts[J.vs.ch.idx];
  click({ "data-copt": String(o.findIndex(function (x) { return x.id !== v.id; })) });
}
function typeIn(text) { els["#cinput"].value = text; click({}, "csubmit"); }
const GRADED = { i: 5, ef: 2.5, n: 5, due: 0, ph: "r", st: 1, lp: 0 };   // 已毕业且复习 5 次 → 手写
const EARLY = { i: 1, ef: 2.5, n: 1, due: 0, ph: "r", st: 1, lp: 0 };    // 刚毕业 → 四选一
/* 有汉字的词（写读音才有意义） */
const KANJI_WORD = J.VOCAB.N5.filter((x) => x.w && x.k)[0];

console.log("\n[1] 作答方式：低熟练度四选一，熟练后手写");
{
  t("新词（无记录）→ 四选一", J.answerOf(null) === "pick");
  t("学习中的词 → 四选一", J.answerOf({ n: 0, ph: "l", st: -1, i: 0 }) === "pick");
  t("毕业 n=1 → 四选一", J.answerOf({ n: 1, ph: "r" }) === "pick");
  t("毕业 n=3 → 四选一", J.answerOf({ n: 3, ph: "r" }) === "pick");
  t("毕业 n=4 → 手写", J.answerOf({ n: 4, ph: "r" }) === "type");
  t("毕业 n=9 → 手写", J.answerOf({ n: 9, ph: "r" }) === "type");
}

console.log("\n[2] 题型 × 作答方式 → 具体题目");
{
  const v = { id: "q1", lv: "N5", k: "たべる", w: "食べる", z: "吃", p: "动" };
  const low = { n: 1, ph: "r" }, high = { n: 5, ph: "r" };
  const f = (mode, c) => J.questionsFor(v, mode, c).map((s) => s.stem + "/" + s.ask).join(",");
  t("看词 + 四选一 → 选释义", f("word", low) === "word/mean", f("word", low));
  t("看词 + 手写 → 写读音", f("word", high) === "word/read", f("word", high));
  t("听音 + 四选一 → 选释义", f("listen", low) === "listen/mean", f("listen", low));
  t("听音 + 手写 → 写这个词", f("listen", high) === "listen/type", f("listen", high));
  t("看义 + 四选一 → 选词形", f("mean", low) === "mean/form", f("mean", low));
  t("看义 + 手写 → 写这个词", f("mean", high) === "mean/type", f("mean", high));
  t("听选 + 四选一 → 两问（选词形 + 选释义）",
    f("choice", low) === "listen/form,listen/mean", f("choice", low));
  t("听选 + 手写 → 写这个词", f("choice", high) === "listen/type", f("choice", high));
  // 纯假名词没有读音可写 —— 让用户抄题干没意义，退回选释义
  const kanaOnly = { id: "q2", lv: "N5", k: "これ", w: "", z: "这个", p: "代" };
  t("假名词 + 手写 → 退回选释义", f("word", { n: 5, ph: "r" }) === "word/mean"
    || J.questionsFor(kanaOnly, "word", { n: 5, ph: "r" })[0].ask === "mean",
    J.questionsFor(kanaOnly, "word", { n: 5, ph: "r" })[0].ask);
}

console.log("\n[3] 选项生成");
{
  const v = J.VOCAB.N5[0];
  const qs = J.buildQuestions(v, "word", { n: 1, ph: "r" });
  const o = qs.opts[0];
  t("四选一给 4 个选项", o.length === 4, o.length);
  t("含正确项", o.some((x) => x.id === v.id));
  t("选项 id 互不重复", new Set(o.map((x) => x.id)).size === o.length);
  t("释义互不重复", new Set(o.map((x) => x.z)).size === o.length, o.map((x) => x.z).join(" / "));
  t("输入题不生成选项", J.buildQuestions(v, "listen", { n: 9, ph: "r" }).opts[0] === null);
  // 池子极小也要出得来（放宽到全部级别）
  const lonely = { id: "zz1", lv: "ZZ", k: "ねこ", w: "猫", z: "猫", p: "名" };
  t("本级别词不足时放宽到全部单词", J.choiceDistractors(lonely, "mean", 3).length === 3,
    J.choiceDistractors(lonely, "mean", 3).length);
}

console.log("\n[4] 客观判分：对错决定档位，用时只在「全对」时细分");
{
  t("全错 → 忘记", J.gradeObjective(0, 2, 2000) === 0);
  t("对一半 → 困难", J.gradeObjective(1, 2, 2000) === 1);
  t("全对 + 每题 1 秒 → 简单", J.gradeObjective(2, 2, 2000) === 3, J.gradeObjective(2, 2, 2000));
  t("全对 + 每题 3 秒 → 良好", J.gradeObjective(2, 2, 6000) === 2, J.gradeObjective(2, 2, 6000));
  t("全对但很慢（>9 秒/题）→ 困难，不会因为慢就判成忘记",
    J.gradeObjective(2, 2, 20000) === 1, J.gradeObjective(2, 2, 20000));
  t("单问答对且快 → 简单", J.gradeObjective(1, 1, 1000) === 3);
  t("单问答错 → 忘记", J.gradeObjective(0, 1, 1000) === 0);
  // 手写题按「合理用时」判：读题 2 秒 + 每假名 0.5 秒
  t("手写：7 假名词合理用时 ≈ 5.5 秒（读题 2s + 7×0.5s）",
    J.expectTypedMs({ k: "ちゅうごくじん" }) === 5500, J.expectTypedMs({ k: "ちゅうごくじん" }));
  t("手写：1.5 倍用时内 → 简单", J.gradeObjective(1, 1, 5200, 5000) === 3, J.gradeObjective(1, 1, 5200, 5000));
  t("手写：2 倍用时 → 良好（实测 9.5 秒打完 6 假名词不再被误判困难）",
    J.gradeObjective(1, 1, 9500, 5000) === 2, J.gradeObjective(1, 1, 9500, 5000));
  t("手写：磨了很久 → 困难", J.gradeObjective(1, 1, 20000, 5000) === 1, J.gradeObjective(1, 1, 20000, 5000));
  t("手写答错仍 → 忘记", J.gradeObjective(0, 1, 3000, 5000) === 0);
  t("gradeChoice 兼容两问式：对一半 → 困难", J.gradeChoice(true, false, 3000) === 1);
  t("gradeChoice：全对 + 每题 1 秒 → 简单", J.gradeChoice(true, true, 2000) === 3);
  t("gradeChoice：全对 + 每题 3 秒 → 良好", J.gradeChoice(true, true, 6000) === 2);
}

console.log("\n[5] 输入作答的判定");
{
  const v = { id: "t1", lv: "N5", k: "たべる", w: "食べる", z: "吃", p: "动" };
  t("写假名 → 对", J.matchTyped(v, "type", "たべる") === true);
  t("写汉字 → 也算对", J.matchTyped(v, "type", "食べる") === true);
  t("带空格 → 对", J.matchTyped(v, "type", " 食べる ") === true);
  t("写别的词 → 错", J.matchTyped(v, "type", "のむ") === false);
  t("写读音：假名 → 对", J.matchTyped(v, "read", "たべる") === true);
  t("写读音：写汉字不算（问的就是读音）", J.matchTyped(v, "read", "食べる") === false);
  const k2 = { id: "t2", lv: "N5", k: "コーヒー", w: "", z: "咖啡", p: "名" };
  t("片假名词写平假名 → 对", J.matchTyped(k2, "read", "こーひー") === true);
  t("写片假名 → 对", J.matchTyped(k2, "read", "コーヒー") === true);
  t("长音符不能丢（こひ ≠ こーひー）", J.matchTyped(k2, "read", "こひ") === false);
  t("空输入 → 不算对", J.matchTyped(v, "type", "") === false);
}

console.log("\n[6] 完整流程：四选一答对 → 判分 → 回写 SRS → 翻面");
{
  const v = J.VOCAB.N5[3];
  cardFor(v, EARLY, "word", "review");
  const front = frontOf(cardHTML());
  t("正面有 4 个选项", (front.match(/data-copt=/g) || []).length === 4,
    (front.match(/data-copt=/g) || []).length);
  t("正面没有自评按钮", front.indexOf('data-g="') < 0);
  t("未作答时不显示判定", cardHTML().indexOf("本题判定") < 0);

  const dueBefore = S.cards[v.id].due;
  pickCorrect(v);
  const back = cardHTML();
  t("答对 → 显示本题判定", back.indexOf("本题判定") >= 0);
  t("答对 → 良好或简单", J.vs.ch.grade === 2 || J.vs.ch.grade === 3, J.vs.ch.grade);
  t("翻到背面", J.vs.show === true);
  t("背面有「下一张」", /id="cnext"/.test(back));
  t("背面没有自评按钮", back.indexOf('data-g="') < 0);
  t("SRS 已写入（不是只改界面）", S.cards[v.id].due !== dueBefore);
  t("答对不进错词本", S.wrong.indexOf(v.id) < 0);

  const before = J.vs.idx;
  click({}, "cnext");
  t("下一张：队列前进", J.vs.idx === before + 1, J.vs.idx);
}

console.log("\n[7] 完整流程：熟练词 → 手写，写错照常记入复习计划");
{
  const v = KANJI_WORD;
  cardFor(v, GRADED, "word", "review");
  t("熟练词改用输入作答", J.answerOf(S.cards[v.id]) === "type");
  const front = frontOf(cardHTML());
  t("正面是输入框而不是选项", front.indexOf('id="cinput"') >= 0);
  t("正面有「提交」按钮", front.indexOf('id="csubmit"') >= 0);
  t("正面没有选项", front.indexOf("data-copt=") < 0);
  t("写读音题必须遮住假名（否则等于送答案）", front.indexOf(v.k) < 0, v.k);

  typeIn("まちがえたよ");
  t("写错 → 忘记", J.vs.ch.grade === 0, J.vs.ch.grade);
  t("写错 → 进错词本", S.wrong.indexOf(v.id) >= 0);
  t("背面给出正确读音", cardHTML().indexOf(v.k) >= 0);
  t("写错 → 打回学习步", S.cards[v.id] && S.cards[v.id].ph === "l", S.cards[v.id] && S.cards[v.id].ph);

  // 写对
  cardFor(v, GRADED, "word", "review");
  typeIn(v.k);
  t("写对 → 良好或简单", J.vs.ch.grade === 2 || J.vs.ch.grade === 3, J.vs.ch.grade);
  t("写对不进错词本", S.wrong.indexOf(v.id) < 0);
}

console.log("\n[8] 多问式（听选）：答完第 1 问才能进第 2 问");
{
  const v = J.VOCAB.N5[4];
  cardFor(v, EARLY, "choice", "review");
  t("听选是 2 问", J.vs.ch.specs.length === 2, J.vs.ch.specs.length);
  t("第 1 问选词形", J.vs.ch.specs[0].ask === "form");
  t("第 2 问选释义", J.vs.ch.specs[1].ask === "mean");
  t("没答之前没有「下一问」", frontOf(cardHTML()).indexOf('id="cstep"') < 0);

  pickCorrect(v);
  t("答完第 1 问出现「下一问」", frontOf(cardHTML()).indexOf('id="cstep"') >= 0);
  t("两问没答完不写 SRS", S.cards[v.id].due === 0, S.cards[v.id].due);
  click({}, "cstep");
  t("进到第 2 问", J.vs.ch.idx === 1);

  pickWrong(v);                                    // 第 2 问答错
  t("两问答完 → 对一半 → 困难", J.vs.ch.grade === 1, J.vs.ch.grade);
  t("两问结果都列出来", /本题判定/.test(cardHTML()));
  t("翻到背面", J.vs.show === true);
}

console.log("\n[9] 防连点 / 「不会，看答案」");
{
  const v = J.VOCAB.N5[5];
  cardFor(v, EARLY, "word", "review");
  pickWrong(v);
  const g = J.vs.ch.grade;
  pickCorrect(v);                                  // 已判定后再点
  t("判定后重复点击不改结果", J.vs.ch.grade === g, J.vs.ch.grade);

  cardFor(v, EARLY, "word", "review");
  click({}, "cgive");
  t("「不会，看答案」→ 忘记", J.vs.ch.grade === 0, J.vs.ch.grade);
  t("「不会，看答案」→ 翻到背面", J.vs.show === true);
  t("「不会，看答案」→ 进错词本", S.wrong.indexOf(v.id) >= 0);
}

console.log("\n[10] 学习页也走客观作答（新词 = 先猜后学）");
{
  const v = J.VOCAB.N5[6];
  cardFor(v, null, "word", "learn");
  t("新词用四选一", J.answerOf(S.cards[v.id]) === "pick");
  t("新词正面有选项", (frontOf(cardHTML()).match(/data-copt=/g) || []).length === 4);
  t("新词正面没有自评按钮", frontOf(cardHTML()).indexOf('data-g="') < 0);
  pickCorrect(v);
  t("新词答对 → 写入 SRS", !!S.cards[v.id]);
}

console.log("\n[11] 五种练法都出得来题（不会因为池子/规则出不来而空白）");
{
  let bad = 0;
  ["word", "choice", "listen", "mean"].forEach(function (m) {
    try {
      const v = J.VOCAB.N5[J.VOCAB.N5.length - 1];
      cardFor(v, EARLY, m, "review");
      const qs = J.vs.ch;
      if (!qs || !qs.specs.length) { bad++; return; }
      // 四选一必须有选项；输入题必须有 ask
      qs.specs.forEach(function (s, i) {
        if (s.ask === "mean" || s.ask === "form") { if (!qs.opts[i] || !qs.opts[i].length) bad++; }
      });
      if (cardHTML().length < 50) bad++;
    } catch (e) { bad++; console.log("    " + m + " → " + e.message); }
  });
  t("四种练法都能正常出题渲染", bad === 0, bad);
}

console.log("\n[12] 发音比对：假名归一化与相似度");
{
  t("片假名归一到平假名", J.kanaNorm("コーヒー") === J.kanaNorm("こーひー"));
  t("去空格与标点", J.kanaNorm("ねこ。 ") === "ねこ");
  t("完全相同 → 1", J.pronSim("ねこ", "ねこ") === 1);
  t("片假名/平假名写法差异 → 仍算 1", J.pronSim("コーヒー", "こーひー") === 1);
  t("差一个音 → 中间分（非满分）",
    J.pronSim("ねこ", "ねご") >= 0.4 && J.pronSim("ねこ", "ねご") < 1, J.pronSim("ねこ", "ねご"));
  t("完全不相干 → 低分", J.pronSim("ねこ", "さかな") < 0.4);
  t("识别多带助词 → 仍给高分", J.pronSim("ねこ", "ねこです") >= 0.85);
  t("空输入 → 0", J.pronSim("", "ねこ") === 0 && J.pronSim("ねこ", "") === 0);
  t("编辑距离：相同 0 / 一替换 1 / 空串", J.levDist("abc", "abc") === 0
    && J.levDist("abc", "abd") === 1 && J.levDist("", "abc") === 3);
  t("判定分档 good/near/bad",
    J.pronVerdict(1) === "good" && J.pronVerdict(0.8) === "near" && J.pronVerdict(0.3) === "bad");
  const v = { id: "p1", k: "ねこ", w: "猫" };
  t("识别成汉字也算读对", J.pronBest(v, ["猫"]).score === 1);
  t("多候选取最好的", J.pronBest(v, ["さかな", "ねこ"]).score === 1);
  t("空候选 → 0 分且不报错", J.pronBest(v, []).score === 0);
}

console.log("\n[13] 发音练习：浏览器不支持时给提示而不是崩");
{
  delete globalThis.SpeechRecognition;
  delete globalThis.webkitSpeechRecognition;
  const v = J.VOCAB.N5[7];
  cardFor(v, EARLY, "word", "review");
  let threw = false;
  try { J.startPron(); } catch (e) { threw = true; console.log("    " + e.message); }
  t("不支持时不抛异常", !threw);
  t("给出可懂的提示", /不支持/.test(els["#pronres"].innerHTML), els["#pronres"].innerHTML);
}

console.log("\n[14] 发音识别结果不会写到下一张卡（令牌守卫）");
{
  let inst = null;
  globalThis.SpeechRecognition = function () {
    inst = this;
    this.start = function () {};
    this.abort = function () {};
  };
  const v = J.VOCAB.N5[8];
  cardFor(v, EARLY, "word", "review");
  J.startPron();
  t("创建了识别器", !!inst);
  t("显示「正在听」", /正在听/.test(els["#pronres"].innerHTML));
  J.vs.idx++; J.vs.show = false; J.vs.ch = null;
  J.renderCard();
  els["#pronres"].innerHTML = "";
  inst.onresult({ results: [[{ transcript: "ねこ" }]] });
  t("迟到的结果被丢弃，不写进新卡", els["#pronres"].innerHTML === "",
    JSON.stringify(els["#pronres"].innerHTML));
  delete globalThis.SpeechRecognition;
}

console.log("\n[15] 发音练习不参与 SRS（只做练习）");
{
  let inst = null;
  globalThis.SpeechRecognition = function () { inst = this; this.start = function () {}; };
  const v = J.VOCAB.N5[9];
  cardFor(v, GRADED, "word", "review");
  const v2 = J.vs.queue[J.vs.idx];
  const before = JSON.stringify(S.cards[v2.id]);
  J.startPron();
  inst.onresult({ results: [[{ transcript: "まったく違う言葉" }]] });
  t("读错也不进错词本", S.wrong.indexOf(v2.id) < 0);
  t("读错也不改 SRS 卡片", JSON.stringify(S.cards[v2.id]) === before);
  t("记录了练习次数", S.pron && S.pron[v2.id] && S.pron[v2.id].n >= 1,
    JSON.stringify(S.pron && S.pron[v2.id]));
  delete globalThis.SpeechRecognition;
}

console.log("\n[16] 旧存档兼容：pron 字段补齐且不污染默认值");
{
  t("pron 是独立对象", typeof S.pron === "object" && S.pron !== null);
}

console.log("\n" + (fail ? "✗" : "✓") + " v24 结果：" + pass + "/" + (pass + fail) + " 通过");
if (fail) process.exitCode = 1;
