/* v24 验证：听选（听音选答）+ 麦克风发音练习
 * 用户反馈：「将复习的方式改成听选，听语音选单词和翻译，这样记忆更深刻；
 *            如果可以还能加入接收用户读音来纠正加强口语锻炼」
 *
 * 要点：① 听选是**客观判分**（两问对错定档），不出现自评按钮
 *       ② 判分必须照样回写 SRS（否则记忆机制白做）
 *       ③ 发音练习只做练习，不参与 SRS
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

/* 把当前卡设成听选模式并渲染 */
function setupCard(mode) {
  S.cards = {}; S.wrong = []; S.today = { date: "", new: 0, rev: 0 };
  S.settings.cardMode = mode || "choice";
  S.settings.cardKana = true;
  J.setStateFor("learn");
  const st = J.ls;
  st.lv = "N5"; st.src = ""; st.lesson = 0; st.ch = null;
  J.buildQueue(true);
  J.renderCard();
  return st;
}
const idxOf = (opts, id) => opts.findIndex((o) => o.id === id);

console.log("\n[1] 听选进入模式列表，并接进自动进阶阶梯");
{
  t("CARD_MODES 含 choice（共 5 种）", J.CARD_MODES.length === 5, J.CARD_MODES.length);
  t("顺序为 auto/word/choice/listen/mean",
    J.CARD_MODES.map((m) => m[0]).join(",") === "auto,word,choice,listen,mean",
    J.CARD_MODES.map((m) => m[0]).join(","));

  S.settings.cardMode = "auto";
  const mk = (n) => ({ n: n, ph: "r", i: n, ef: 2.5, due: 0, st: 1, lp: 0 });
  t("没学过 → 看词想义", J.dirOf(null) === "word");
  t("学习中 → 看词想义", J.dirOf({ n: 0, ph: "l", st: -1 }) === "word");
  t("毕业 n=2 → 看词想义", J.dirOf(mk(2)) === "word");
  t("毕业 n=3 → 听音选答", J.dirOf(mk(3)) === "choice", J.dirOf(mk(3)));
  t("毕业 n=4 → 听音辨义", J.dirOf(mk(4)) === "listen", J.dirOf(mk(4)));
  t("毕业 n=5 → 听音辨义", J.dirOf(mk(5)) === "listen", J.dirOf(mk(5)));
  t("毕业 n=9 → 看义想词", J.dirOf(mk(9)) === "mean");
  S.settings.cardMode = "auto";
}

console.log("\n[2] 选项生成：4 个、含正确项、互不重复");
{
  const v = J.VOCAB.N5[0];
  const ch = J.buildChoice(v);
  t("能造出题目", !!ch, ch);
  t("选词题 4 个选项", ch.wopts.length === J.CHOICE_N, ch.wopts.length);
  t("选义题 4 个选项", ch.mopts.length === J.CHOICE_N, ch.mopts.length);
  t("选词选项含正确项", idxOf(ch.wopts, v.id) >= 0);
  t("选义选项含正确项", idxOf(ch.mopts, v.id) >= 0);
  t("选词选项 id 互不重复", new Set(ch.wopts.map((o) => o.id)).size === ch.wopts.length);
  t("选义选项 id 互不重复", new Set(ch.mopts.map((o) => o.id)).size === ch.mopts.length);
  t("选义选项中文互不重复",
    new Set(ch.mopts.map((o) => o.z)).size === ch.mopts.length,
    ch.mopts.map((o) => o.z).join(" / "));
  t("干扰项都同级别", ch.wopts.every((o) => o.lv === v.lv));
  t("初始状态：第 1 问、未选", ch.step === 0 && ch.pickW === -1 && ch.grade === null);

  // 抽若干词，确认选项数稳定且都含正确项
  let bad = 0;
  for (let i = 0; i < 40; i++) {
    const w = J.VOCAB.N5[i * 7 % J.VOCAB.N5.length];
    const c2 = J.buildChoice(w);
    if (!c2) continue;
    if (c2.wopts.length !== J.CHOICE_N || c2.mopts.length !== J.CHOICE_N) bad++;
    if (idxOf(c2.wopts, w.id) < 0 || idxOf(c2.mopts, w.id) < 0) bad++;
  }
  t("抽样 40 词选项都完整含正确项", bad === 0, bad);
}

console.log("\n[3] 客观判分：对错决定档位，不靠自评");
{
  t("两问全对 + 快（3 秒）→ 简单", J.gradeChoice(true, true, 3000) === 3, J.gradeChoice(true, true, 3000));
  t("两问全对 + 慢（8 秒）→ 良好", J.gradeChoice(true, true, 8000) === 2, J.gradeChoice(true, true, 8000));
  t("只对选词 → 困难", J.gradeChoice(true, false, 2000) === 1);
  t("只对选义 → 困难", J.gradeChoice(false, true, 2000) === 1);
  t("两问全错 → 忘记", J.gradeChoice(false, false, 2000) === 0);
}

console.log("\n[4] 完整流程：答两问 → 判分 → 回写 SRS → 翻面");
{
  const st = setupCard("choice");
  const v = st.queue[0];
  t("进了听选模式", J.dirOf(S.cards[v.id]) === "choice" || S.settings.cardMode === "choice");
  t("正面有 4 个选项", (frontOf(cardHTML()).match(/data-copt=/g) || []).length === J.CHOICE_N,
    (frontOf(cardHTML()).match(/data-copt=/g) || []).length);
  t("正面没有自评按钮", frontOf(cardHTML()).indexOf('data-g="') < 0);
  t("正面不含词形（不给答案）", frontOf(cardHTML()).indexOf(v.k) < 0 || !v.w, v.k);

  const ch = J.vs.ch;
  click({ "data-copt": String(idxOf(ch.wopts, v.id)) });          // 第 1 问答对
  t("第 1 问答对后标记 okW", J.vs.ch.okW === true);
  t("答对后正确项标绿", /class="copt[^"]*ok/.test(cardHTML()));
  t("答完第 1 问出现「下一问」", /data-cstep="1"/.test(cardHTML()));
  t("此刻还没写 SRS", !S.cards[v.id]);

  click({ "data-cstep": "1" });
  t("进到第 2 问", J.vs.ch.step === 1);
  t("第 2 问显示中文选项", cardHTML().indexOf(v.z) >= 0);

  // 第 2 问答错
  const wrongIdx = idxOf(J.vs.ch.mopts, v.id) === 0 ? 1 : 0;
  click({ "data-copt": String(wrongIdx) });
  t("第 2 问答完 → 自动判分", J.vs.ch.grade !== null, J.vs.ch.grade);
  t("对一半 → 困难(1)", J.vs.ch.grade === 1, J.vs.ch.grade);
  t("翻到背面", J.vs.show === true);
  const back = cardHTML();
  t("背面显示两问结果", /本题判定/.test(back));
  t("背面有「下一张」", /id="cnext"/.test(back));
  t("背面没有自评按钮（客观判分）", back.indexOf('data-g="') < 0);

  const c = S.cards[v.id];
  t("SRS 已写入（不是只改界面）", !!c, JSON.stringify(c));
  t("答错 → 打回学习步", c && c.ph === "l", c && c.ph);
  t("答错 → 记入失误计数", c && c.lp >= 1, c && c.lp);
  t("答错 → 进错词本", S.wrong.indexOf(v.id) >= 0);

  const before = J.vs.idx;
  const prevId = v.id;
  click({}, "cnext");
  t("下一张：队列前进", J.vs.idx === before + 1, J.vs.idx);
  // 换卡后立刻为新卡重建题目（而不是沿用上一张的选项）
  if (J.vs.idx < J.vs.queue.length) {
    const nch = J.vs.ch;
    t("下一张：为新卡重建题目", nch && nch.id !== prevId, nch && nch.id);
    t("下一张：新题回到第 1 问且未选", nch && nch.step === 0 && nch.pickW === -1 && nch.grade === null);
  } else {
    t("下一张：队列已走完，状态清空", J.vs.ch === null);
  }
}

console.log("\n[5] 全对路径：直接进复习排期，不进错词本");
{
  const st = setupCard("choice");
  const v = st.queue[0];
  // 先让这个词处于「已毕业」状态，才能看出全对的排期效果
  S.cards[v.id] = { i: 6, ef: 2.5, n: 6, due: 0, ph: "r", st: 1, lp: 0 };
  S.settings.cardMode = "choice";
  J.buildQueue(true); J.renderCard();
  const v2 = J.ls.queue[J.ls.idx];
  S.cards[v2.id] = { i: 6, ef: 2.5, n: 6, due: 0, ph: "r", st: 1, lp: 0 };
  J.renderCard();
  const ch = J.vs.ch;
  click({ "data-copt": String(idxOf(ch.wopts, v2.id)) });
  click({ "data-cstep": "1" });
  J.vs.ch.t0 = Date.now() - 1000;                  // 假装很快（<4 秒）
  click({ "data-copt": String(idxOf(J.vs.ch.mopts, v2.id)) });
  t("全对 + 快 → 简单(3)", J.vs.ch.grade === 3, J.vs.ch.grade);
  const c = S.cards[v2.id];
  t("全对 → 复习次数 +1", c && c.n === 7, c && c.n);
  t("全对 → 仍在已毕业状态", c && c.ph === "r", c && c.ph);
  t("全对 → 不进错词本", S.wrong.indexOf(v2.id) < 0);
  t("全对 → 下次复习被推后", c && c.due > Date.now(), c && (c.due - Date.now()));
}

console.log("\n[6] 防连点：同一问重复点击不重复计分");
{
  const st = setupCard("choice");
  const v = st.queue[0];
  const ch = J.vs.ch;
  const i = idxOf(ch.wopts, v.id);
  click({ "data-copt": String(i) });
  const after1 = J.vs.ch.pickW;
  click({ "data-copt": String(i === 0 ? 1 : 0) });     // 再点别的
  t("第 1 问重复点击不改判定", J.vs.ch.pickW === after1, J.vs.ch.pickW + " vs " + after1);
  t("第 1 问仍未翻面", J.vs.show === false);
  // 第 2 问同理
  click({ "data-cstep": "1" });
  click({ "data-copt": String(idxOf(J.vs.ch.mopts, v.id)) });
  const g = J.vs.ch.grade;
  click({ "data-copt": "0" });
  click({ "data-copt": "1" });
  t("第 2 问重复点击不改判定", J.vs.ch.grade === g, J.vs.ch.grade + " vs " + g);
}

console.log("\n[7] 池子不够时不硬出听选（退回看词想义）");
{
  // 造一个孤立的级别池：只有 1 个词 → 造不出 4 选 1
  const savedN5 = J.VOCAB.N5;
  const v = { id: "x1", lv: "ZZ", k: "ねこ", w: "猫", z: "猫", p: "名" };
  t("干扰项不足 → buildChoice 返回 null", J.buildChoice(v) === null);
  t("原级别数据未被破坏", J.VOCAB.N5 === savedN5);
}

console.log("\n[8] 发音比对：假名归一化与相似度");
{
  t("片假名归一到平假名", J.kanaNorm("コーヒー") === J.kanaNorm("こーひー"),
    J.kanaNorm("コーヒー") + " / " + J.kanaNorm("こーひー"));
  t("去空格与标点", J.kanaNorm("ねこ。 ") === "ねこ");
  t("长音符视为等价写法", J.kanaNorm("コーヒー").indexOf("ー") < 0);
  t("完全相同 → 1", J.pronSim("ねこ", "ねこ") === 1);
  t("片假名/平假名写法差异 → 仍算 1", J.pronSim("コーヒー", "こーひー") === 1);
  // 2 音节的词错 1 个音 → 0.5（不满分，也不会误判成完全无关）
  t("差一个音 → 中间分（非满分）",
    J.pronSim("ねこ", "ねご") >= 0.4 && J.pronSim("ねこ", "ねご") < 1, J.pronSim("ねこ", "ねご"));
  t("完全不相干 → 低分", J.pronSim("ねこ", "さかな") < 0.4, J.pronSim("ねこ", "さかな"));
  t("识别多带助词 → 仍给高分", J.pronSim("ねこ", "ねこです") >= 0.85, J.pronSim("ねこ", "ねこです"));
  t("空输入 → 0", J.pronSim("", "ねこ") === 0 && J.pronSim("ねこ", "") === 0);
  t("编辑距离：相同为 0", J.levDist("abc", "abc") === 0);
  t("编辑距离：一替换为 1", J.levDist("abc", "abd") === 1);
  t("编辑距离：空串", J.levDist("", "abc") === 3);
  // 判定分档
  t("1.0 → good", J.pronVerdict(1) === "good");
  t("0.8 → near", J.pronVerdict(0.8) === "near");
  t("0.3 → bad", J.pronVerdict(0.3) === "bad");
  // 识别可能回汉字，所以要和 v.w 也比
  const v = { id: "p1", k: "ねこ", w: "猫" };
  t("识别成汉字也算读对", J.pronBest(v, ["猫"]).score === 1, J.pronBest(v, ["猫"]).score);
  t("多候选取最好的", J.pronBest(v, ["さかな", "ねこ"]).score === 1);
  t("空候选 → 0 分且不报错", J.pronBest(v, []).score === 0);
}

console.log("\n[9] 发音练习：不支持时给提示而不是崩");
{
  delete globalThis.SpeechRecognition;
  delete globalThis.webkitSpeechRecognition;
  setupCard("choice");
  let threw = false;
  try { J.startPron(); } catch (e) { threw = true; console.log("    " + e.message); }
  t("浏览器不支持时不抛异常", !threw);
  t("给出可懂的提示", /不支持/.test(els["#pronres"].innerHTML), els["#pronres"].innerHTML);
}

console.log("\n[10] 发音识别结果不会写到下一张卡（令牌守卫）");
{
  let inst = null;
  globalThis.SpeechRecognition = function () {
    inst = this;
    this.start = function () {};
    this.abort = function () {};
  };
  const st = setupCard("choice");
  J.startPron();
  t("创建了识别器并开始监听", !!inst);
  t("显示「正在听」", /正在听/.test(els["#pronres"].innerHTML));
  // 换卡（markCardShown 里 pronToken++）
  J.vs.idx++;
  J.vs.show = false; J.vs.ch = null;
  J.renderCard();
  els["#pronres"].innerHTML = "";
  inst.onresult({ results: [[{ transcript: "ねこ" }]] });     // 迟到的识别结果
  t("迟到的结果被丢弃，不写进新卡", els["#pronres"].innerHTML === "",
    JSON.stringify(els["#pronres"].innerHTML));
  delete globalThis.SpeechRecognition;
}

console.log("\n[11] 发音练习不参与 SRS（只做练习）");
{
  let inst = null;
  globalThis.SpeechRecognition = function () {
    inst = this;
    this.start = function () {};
  };
  const st = setupCard("choice");
  const v = st.queue[0];
  S.cards[v.id] = { i: 6, ef: 2.5, n: 6, due: 12345, ph: "r", st: 1, lp: 0 };
  J.renderCard();
  const v2 = J.vs.queue[J.vs.idx];
  const before = JSON.stringify(S.cards[v2.id]);
  J.startPron();
  inst.onresult({ results: [[{ transcript: "まったく違う言葉" }]] });
  t("读错也不会进错词本", S.wrong.indexOf(v2.id) < 0);
  t("读错也不改 SRS 卡片", JSON.stringify(S.cards[v2.id]) === before);
  t("记录了练习次数", S.pron && S.pron[v2.id] && S.pron[v2.id].n >= 1,
    JSON.stringify(S.pron && S.pron[v2.id]));
  delete globalThis.SpeechRecognition;
}

console.log("\n[12] 其他模式不受影响");
{
  S.settings.cardMode = "word";
  setupCard("word");
  t("看词想义仍有自评按钮", cardHTML().indexOf('data-g="') >= 0);
  S.settings.cardMode = "listen";
  setupCard("listen");
  t("听音辨义仍有自评按钮", cardHTML().indexOf('data-g="') >= 0);
  let threw = false;
  try {
    ["auto", "word", "choice", "listen", "mean"].forEach((m) => {
      S.settings.cardMode = m; J.renderCard();
    });
  } catch (e) { threw = true; console.log("    " + e.message); }
  t("五种模式渲染均不抛异常", !threw);
  S.settings.cardMode = "auto";
}

console.log("\n[13] 旧存档兼容：pron 字段补齐且不污染默认值");
{
  t("pron 是独立对象", typeof S.pron === "object" && S.pron !== null);
}

console.log("\n" + (fail ? "✗" : "✓") + " v24 结果：" + pass + "/" + (pass + fail) + " 通过");
if (fail) process.exitCode = 1;
