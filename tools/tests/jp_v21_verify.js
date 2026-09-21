/* v21 验证：自主复习 —— 不看到期时间，主动过已学的词
 * 背景：用户反馈「想针对性复习自己已学的单词没有界面，只能在复习界面等到期」。
 * 新增复习页「选词」三档：due 到期待复习（默认）/ all 全部已学 / wrong 只练错词。
 * 运行：node jp_v21_verify.js（cwd = 日语学习站）
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
globalThis.location = { hash: "#/review" };
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
    id: id || "",
    getAttribute(n) { return a[n] !== undefined ? a[n] : null; },
    closest(sel) {
      if (sel === "button") return self;
      const m = /^\[(.+)\]$/.exec(sel);
      if (m && a[m[1]] !== undefined) return self;
      return null;
    },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    querySelector() { return null; }, querySelectorAll() { return []; },
    remove() {}, insertAdjacentHTML() {}, focus() {}, click() {}
  };
  return self;
}
function click(attrs, id) {
  const ev = { target: fakeTarget(attrs, id) };
  (handlers.click || []).forEach((fn) => fn(ev));
}
function goto(hash) { globalThis.location.hash = hash; J.render(); }

/* ---------- 场景：学了 N5 前 20 个词，其中 5 个已到期 ---------- */
const DAY = 86400000, now = Date.now();
const learned = J.VOCAB.N5.slice(0, 20);
S.cards = {}; S.today = { new: 0, rev: 0 }; S.wrong = [];
learned.forEach((v, i) => {
  if (i < 5) S.cards[v.id] = { i: 3, ef: 2.5, n: 3, due: now - 3600000, ph: "r", st: 1, lp: 0 };        // 已逾期
  else if (i < 10) S.cards[v.id] = { i: 2, ef: 2.5, n: 2, due: now + DAY, ph: "r", st: 1, lp: 0 };      // 1 天后
  else S.cards[v.id] = { i: 5, ef: 2.5, n: 4, due: now + DAY * (i - 9), ph: "r", st: 1, lp: 0 };       // 更远
});
S.wrong = [learned[7].id, learned[12].id];

J.setStateFor("review");
const rs = J.rs;
rs.lv = "N5"; rs.src = ""; rs.lesson = 0; rs.rmode = "due";

console.log("\n[1] studiedList：只取学过的词，不看到期时间");
{
  const all = J.studiedList("N5", "", 0, false);
  t("返回 20 个（全部已学）", all.length === 20, all.length);
  t("全部都有 cards 记录", all.every((v) => !!S.cards[v.id]));
  t("包含未到期的词", all.some((v) => S.cards[v.id].due > now));
  t("不含没学过的词", all.every((v) => learned.indexOf(v) >= 0));

  const wrong = J.studiedList("N5", "", 0, true);
  t("wrongOnly 只取错词本里的", wrong.length === 2 && wrong.every((v) => S.wrong.indexOf(v.id) >= 0), wrong.length);

  // 排序：due 升序（逾期最久的在前）
  let sorted = true;
  for (let i = 1; i < all.length; i++) if (S.cards[all[i - 1].id].due > S.cards[all[i].id].due) sorted = false;
  t("按 due 升序（最该复习的在前）", sorted, all.slice(0, 3).map((v) => v.k).join(" "));
  t("第一个是逾期的词", S.cards[all[0].id].due < now, new Date(S.cards[all[0].id].due).toISOString());

  t("跨级别过滤生效", J.studiedList("N3", "", 0, false).length === 0);
  t("studiedCount(N5)=20", J.studiedCount("N5") === 20, J.studiedCount("N5"));
}

console.log("\n[2] buildQueue：三种选词方式互不混淆");
{
  rs.rmode = "due"; J.buildQueue(false);
  const dueQ = rs.queue.slice();
  t("due 模式只出到期词", dueQ.length === 5 && dueQ.every((v) => S.cards[v.id].due <= Date.now()), dueQ.length);

  rs.rmode = "all"; J.buildQueue(false);
  const allQ = rs.queue.slice();
  t("all 模式出全部已学（20）", allQ.length === 20, allQ.length);
  t("all 模式包含未到期的词", allQ.some((v) => S.cards[v.id].due > now));
  t("all 模式不含没学过的词", allQ.every((v) => !!S.cards[v.id]));
  t("all 模式数量 = 到期 + 未到期", allQ.length === 5 + 15, allQ.length);

  rs.rmode = "wrong"; J.buildQueue(false);
  t("wrong 模式只出错词（2）", rs.queue.length === 2 && rs.queue.every((v) => S.wrong.indexOf(v.id) >= 0), rs.queue.length);
  t("wrong 模式也是全量而非仅到期（含未到期的错词）",
    rs.queue.some((v) => S.cards[v.id].due > now), rs.queue.map((v) => Math.round((S.cards[v.id].due - now) / DAY) + "d").join(" "));

  t("切模式后索引归零", rs.idx === 0 && rs.show === false);
}

console.log("\n[3] 点击「选词」按钮切换（真实事件链路）");
{
  rs.rmode = "due"; J.buildQueue(false);
  const before = rs.queue.length;
  click({ "data-rvmode": "all" });
  t("点了「全部已学」→ rmode 变更", rs.rmode === "all", rs.rmode);
  t("队列随之重建（20 个）", rs.queue.length === 20, rs.queue.length);
  t("确实比 due 模式多了词", rs.queue.length > before, before + " → " + rs.queue.length);
  click({ "data-rvmode": "wrong" });
  t("点了「只练错词」→ 队列只剩错词", rs.rmode === "wrong" && rs.queue.length === 2, rs.queue.length);
  click({ "data-rvmode": "due" });
  t("切回「到期待复习」", rs.rmode === "due" && rs.queue.length === 5, rs.queue.length);
}

console.log("\n[4] 复习页 UI：三档选词 + 计数 + 级别已学数");
{
  rs.rmode = "due"; J.buildQueue(false);
  let h = J.viewReview();
  t("有「选词」行", h.indexOf("选词：") >= 0);
  t("三档按钮齐全", h.indexOf('data-rvmode="due"') >= 0 && h.indexOf('data-rvmode="all"') >= 0 && h.indexOf('data-rvmode="wrong"') >= 0);
  t("「到期待复习」标出 5", /data-rvmode="due"[^>]*>到期待复习（5）/.test(h), (h.match(/data-rvmode="due"[^>]*>[^<]*/) || [])[0]);
  t("「全部已学」标出 20", /data-rvmode="all"[^>]*>全部已学（20）/.test(h), (h.match(/data-rvmode="all"[^>]*>[^<]*/) || [])[0]);
  t("「只练错词」标出 2", /data-rvmode="wrong"[^>]*>只练错词（2）/.test(h), (h.match(/data-rvmode="wrong"[^>]*>[^<]*/) || [])[0]);
  t("级别按钮显示「已学 N」", /N5（已学 20）/.test(h), (h.match(/N5（[^）]*）/) || [])[0]);
  t("N3 显示已学 0", /N3（已学 0）/.test(h), (h.match(/N3（[^）]*）/) || [])[0]);
  t("课次行标签已改名为「课次：」", h.indexOf("课次：") >= 0 && h.indexOf("范围：") < 0);

  rs.rmode = "all"; J.buildQueue(false);
  h = J.viewReview();
  t("all 模式顶部说明写明「学过的全部词」", h.indexOf("学过的全部词") >= 0);
  t("all 模式统计显示「已学可练：20」", h.indexOf("已学可练：<b>20</b>") >= 0, (h.match(/已学可练：[^<]*<b>\d+/) || [])[0]);
  t("all 模式有「不看到期时间」的说明", h.indexOf("不看到期时间") >= 0);
  t("current=all 时按钮高亮", /class="chip on" data-rvmode="all"/.test(h));

  rs.rmode = "wrong"; J.buildQueue(false);
  h = J.viewReview();
  t("wrong 模式统计显示「错词：2」", h.indexOf("错词：<b>2</b>") >= 0, (h.match(/错词：[^<]*<b>\d+/) || [])[0]);
  t("wrong 模式说明提到「忘记 / 困难」", h.indexOf("忘记") >= 0);

  rs.rmode = "due"; J.buildQueue(false);
  h = J.viewReview();
  t("due 模式统计显示「到期待复习：5」", h.indexOf("到期待复习：<b>5</b>") >= 0, (h.match(/到期待复习：[^<]*<b>\d+/) || [])[0]);
  t("due 模式说明提示可切到「全部已学」", h.indexOf("全部已学") >= 0);
}

console.log("\n[5] 收尾提示：不再让用户「只能干等」（核心痛点）");
{
  // 场景：没有到期词，但有已学的词
  const bak = {};
  learned.forEach((v) => { bak[v.id] = S.cards[v.id].due; S.cards[v.id].due = now + DAY * 10; });
  J.setStateFor("review"); rs.rmode = "due"; J.buildQueue(false);
  t("due 模式无到期词 → 队列为空", rs.queue.length === 0, rs.queue.length);
  let d = J.doneHTML();
  t("给出「自主复习」按钮", d.indexOf('data-rvmode="all"') >= 0, (d.match(/data-rvmode="all"[^>]*>[^<]*/) || [])[0]);
  t("写明有几个已学的词可复习", /20<\/b> 个学过的词/.test(d) || d.indexOf("<b>20</b>") >= 0, d.slice(0, 160));
  t("写明「不看到期时间」", d.indexOf("不看到期时间") >= 0);
  t("错词项也有快捷按钮", d.indexOf('data-rvmode="wrong"') >= 0);

  // all 模式走完
  rs.rmode = "all"; J.buildQueue(false); rs.idx = rs.queue.length;
  d = J.doneHTML();
  t("all 模式走完 → 提示「过完了」", d.indexOf("过完了") >= 0, d.slice(0, 90));
  t("all 模式提供「再过一轮」", d.indexOf('id="vbuild2"') >= 0);
  t("all 模式给出回到默认模式的出口", d.indexOf('data-rvmode="due"') >= 0);

  // wrong 模式且错词本为空
  const bakW = S.wrong; S.wrong = [];
  rs.rmode = "wrong"; J.buildQueue(false); rs.idx = 0;
  d = J.doneHTML();
  t("wrong 模式无错词 → 提示错词本是空的", d.indexOf("错词本是空的") >= 0 || d.indexOf("当前范围还没有学过的词") >= 0, d.slice(0, 90));
  S.wrong = bakW;

  // 当前范围没学过（N3 没学，但 N5 学过）
  rs.lv = "N3"; rs.rmode = "due"; J.buildQueue(false);
  d = J.doneHTML();
  t("当前范围没学过 → 说「当前范围」而不是「还没有学过任何词」",
    d.indexOf("当前范围还没有学过的词") >= 0, d.slice(0, 90));
  rs.lv = "N5";

  // 恢复
  learned.forEach((v) => { S.cards[v.id].due = bak[v.id]; });
}

console.log("\n[6] 与级别 / 来源 / 课次叠加 = 真正的「针对性复习」");
{
  rs.lv = "N5"; rs.rmode = "all"; rs.src = ""; rs.lesson = 0;
  J.buildQueue(false);
  const lessons = {};
  learned.forEach((v) => { lessons[v.l] = (lessons[v.l] || 0) + 1; });
  const L = Object.keys(lessons)[0];
  rs.lesson = parseInt(L, 10); J.buildQueue(false);
  t("all + 指定课次 → 只出该课已学的词", rs.queue.length === lessons[L] && rs.queue.every((v) => v.l === Number(L)),
    rs.queue.length + " vs " + lessons[L]);

  rs.lesson = 0; rs.rmode = "wrong"; J.buildQueue(false);
  const wInScope = rs.queue.filter((v) => S.wrong.indexOf(v.id) >= 0).length;
  t("wrong + 全范围 → 全是错词", rs.queue.length === 2 && wInScope === 2, rs.queue.length);

  rs.lv = "N4"; rs.rmode = "all"; J.buildQueue(false);
  t("切到没学过的级别 → 自主复习为空（不误给别的级别）", rs.queue.length === 0, rs.queue.length);
  rs.lv = "N5";
}

console.log("\n[7] 自主复习时评分照常更新 SRS（不破坏原有机制）");
{
  rs.rmode = "all"; buildAndReset();
  function buildAndReset() { J.buildQueue(false); rs.idx = 0; }
  const v = rs.queue[0];
  const dueBefore = S.cards[v.id].due;
  const revBefore = S.today.rev;
  J.review(v.id, 2);                      // 评「良好」
  t("评分后 due 被更新", S.cards[v.id].due !== dueBefore, new Date(S.cards[v.id].due).toISOString());
  t("评分后今日复习数 +1", S.today.rev === revBefore + 1, S.today.rev + " (was " + revBefore + ")");
  t("评分后 n 递增", S.cards[v.id].n >= 4, S.cards[v.id].n);
}

console.log("\n[8] 不破坏原有行为");
{
  // 学习页不应出现选词行
  J.setStateFor("learn");
  const hl = J.viewLearn();
  t("学习页没有「选词」行", hl.indexOf("选词：") < 0 && hl.indexOf("data-rvmode") < 0);
  t("学习页级别仍显示总量+教材数", /N5（\d+/.test(hl), (hl.match(/N5（[^）]*）/) || [])[0]);

  // 复习默认模式仍是 due
  rs.rmode = "due";
  J.setStateFor("review"); J.buildQueue(false);
  t("复习默认只给到期词（原行为不变）", rs.queue.every((v) => S.cards[v.id].due <= Date.now()));

  // 切模式不应清空进度
  const cardCount = Object.keys(S.cards).length;
  rs.rmode = "all"; J.buildQueue(false);
  t("切模式不影响学习进度", Object.keys(S.cards).length === cardCount, Object.keys(S.cards).length);

  // 进入页面仍会重建（v17 的行为）
  globalThis.location.hash = "#/review";
  const h = J.viewReview();
  t("复习页仍可正常渲染", h.indexOf("复习 · 强化已学") >= 0);

  // 切模式后 doneHTML 不抛异常
  let threw = false;
  ["due", "all", "wrong"].forEach((m) => {
    rs.rmode = m;
    try { J.buildQueue(false); J.doneHTML(); J.viewReview(); } catch (e) { threw = true; console.log("    " + m + ": " + e.message); }
  });
  t("三种模式渲染均不抛异常", !threw);
  rs.rmode = "due";
}

console.log("\n[9] 空 / 边界：完全没学过任何词");
{
  const bak = S.cards; S.cards = {};
  J.setStateFor("review"); rs.rmode = "due"; J.buildQueue(false);
  t("没学过任何词 → 队列为空", rs.queue.length === 0);
  const d = J.doneHTML();
  t("提示「还没有学过任何词」", d.indexOf("还没有学过任何词") >= 0, d.slice(0, 80));
  t("引导去学新词", d.indexOf('data-go="learn"') >= 0);
  rs.rmode = "all"; J.buildQueue(false);
  t("all 模式下也为空且不报错", rs.queue.length === 0 && J.doneHTML().indexOf("还没有学过任何词") >= 0);
  S.cards = bak;
}

console.log("\n" + (fail ? "✗" : "✓") + " v21 结果：" + pass + "/" + (pass + fail) + " 通过");
if (fail) process.exitCode = 1;
