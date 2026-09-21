/* v17 验证：页内操作不应刷新当前单词
 * 背景：点「注音 / 自动播放 / 练习方向」时触发了 render 里的自动重建队列，
 *      idx 归零 → 正在看的词被换掉。改为只有「进入页面 / 跨天」才重建。
 * 运行：node jp_v17_verify.js（cwd = 日语学习站）
 */
const fs = require("fs");
let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra !== undefined ? "   → " + extra : "")); }
}
/* ---------- 环境（含可触发的 click 事件） ---------- */
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

// 造一个假元素，可按属性/ id 命中事件委托里的 A() 与 closest()
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

console.log("\n[1] 页内开关都不应换掉当前单词");
{
  S.cards = {}; S.today.new = 0; S.settings.cardMode = "word"; S.settings.cardKana = true;
  goto("#/learn");
  const st = J.ls;
  const cur = st.queue[st.idx];
  const idx0 = st.idx;
  t("已进入学习页并有当前词", !!cur, st.queue.length);

  click({ "data-ckana": "0" });
  t("点「注音」后仍是同一个词", st.queue[st.idx] === cur, st.queue[st.idx] && st.queue[st.idx].k);
  t("点「注音」后索引未变", st.idx === idx0, st.idx);
  t("注音确实被关掉了", S.settings.cardKana === false);

  click({ "data-cautoplay": "0" });
  t("点「自动播放」后仍是同一个词", st.queue[st.idx] === cur, st.queue[st.idx] && st.queue[st.idx].k);
  t("自动播放确实被关掉了", S.settings.autoPlay === false);

  click({ "data-cmode": "listen" });
  t("切「听音辨义」后仍是同一个词", st.queue[st.idx] === cur, st.queue[st.idx] && st.queue[st.idx].k);
  t("切方向后回到正面（可重看新正面）", st.show === false);
  t("练习方向确实切换了", S.settings.cardMode === "listen");

  click({ "data-cmode": "mean" });
  t("再切「看义想词」仍是同一个词", st.queue[st.idx] === cur, st.queue[st.idx] && st.queue[st.idx].k);
  S.settings.cardMode = "word"; S.settings.cardKana = true; S.settings.autoPlay = true;
}

console.log("\n[2] 同页重复渲染不换队列");
{
  const st = J.ls;
  const q = st.queue;
  J.render(); J.render();
  t("连刷两次 render 队列对象没换", J.ls.queue === q);
  t("索引仍是 0", J.ls.idx === 0, J.ls.idx);
}

console.log("\n[3] 评分后前进，且不会被后续操作拉回队首");
{
  goto("#/learn");
  const st = J.ls;
  const n0 = st.queue.length;
  click({ "data-g": "2" }, "");
  click({ "data-g": "2" }, "");
  t("连评两张 → idx 前进到 2", st.idx === 2, st.idx);
  t("队列长度未变", st.queue.length === n0, st.queue.length);
  click({ "data-ckana": "1" });
  t("评分后再点开关，idx 仍是 2（没被重置）", st.idx === 2, st.idx);
}

console.log("\n[4] 切级别 / 来源 / 课次仍然会重建（这是应有行为）");
{
  goto("#/learn");
  const st = J.ls;
  st.idx = 2;
  click({ "data-vlv": "N4" });
  t("切级别 → 级别生效", J.ls.lv === "N4", J.ls.lv);
  t("切级别 → 队列重建（idx 归零）", J.ls.idx === 0, J.ls.idx);
  t("切级别 → 队列内容属于 N4", J.ls.queue.every((v) => v.lv === "N4"));
  click({ "data-vlv": "N5" });
  const before = J.ls.queue.length;
  click({ "data-vsrc": "base" });
  t("切来源 → 重建且只剩内置词", J.ls.queue.every((v) => !v.book), before);
}

console.log("\n[5] 离开页面再进来会重建");
{
  goto("#/learn");
  J.ls.idx = 3;
  goto("#/home");
  goto("#/learn");
  t("离开再进入 → 队列重建（idx 归零）", J.ls.idx === 0, J.ls.idx);
  goto("#/learn");
  J.ls.idx = 4;
  goto("#/review");
  t("切到复习页 → 复习队列 idx 也是 0", J.rs.idx === 0, J.rs.idx);
  t("两页状态互相独立", J.ls.idx === 4, "learn idx=" + J.ls.idx);
  goto("#/learn");
  t("回到学习页被重建", J.ls.idx === 0);
}

console.log("\n[6] 队列走完仍然能正确收尾（不被不换词影响）");
{
  goto("#/learn");
  const st = J.ls;
  st.show = true;
  st.idx = st.queue.length;          // 模拟刷完
  J.render();
  const h = els["#vcard"].innerHTML;
  t("刷完后显示收尾提示", h.indexOf("done") >= 0 || h.indexOf("本轮完成") >= 0 || h.indexOf("超额") >= 0,
    h.replace(/<[^>]*>/g, "").slice(0, 60));
}

console.log("\n[7] 三种方向切换后卡片内容确实跟着变（换的是练法）");
{
  goto("#/learn");
  const st = J.ls;
  st.idx = 0; st.show = false;
  S.settings.cardMode = "word";
  J.renderCard();
  const hWord = els["#vcard"].innerHTML;
  S.settings.cardMode = "listen";
  J.renderCard();
  const hListen = els["#vcard"].innerHTML;
  S.settings.cardMode = "mean";
  J.renderCard();
  const hMean = els["#vcard"].innerHTML;
  S.settings.cardMode = "word";
  t("看词想义有词形块", hWord.indexOf("cfront") >= 0);
  t("听音辨义正面无词形块", hListen.slice(0, hListen.indexOf("cback")).indexOf("cfront") < 0);
  t("看义想词正面无词形块", hMean.slice(0, hMean.indexOf("cback")).indexOf("cfront") < 0);
  t("三种渲染互不相同", hWord !== hListen && hListen !== hMean && hWord !== hMean);
  t("切模式时当前词没变", st.queue[st.idx] === st.queue[0]);
}

console.log("\n[8] 其他功能未被破坏");
{
  t("数据仍在", J.VOCAB.N5.length > 0 && J.GRAMMAR.length > 0 && J.READING.length > 0);
  t("听写判分可用", J.matchWord({ k: "ねこ", w: "猫" }, "猫") === true);
  t("学习页与复习页视图可渲染", J.viewLearn().indexOf("练习：") >= 0 && J.viewReview().indexOf("练习：") >= 0);
  t("学习步进仍在（LEARN_STEPS 两步）", J.LEARN_STEPS.length === 2);
}

console.log("\n───────────────");
console.log("v17 结果：" + pass + "/" + (pass + fail) + " 通过" + (fail ? "，" + fail + " 失败" : ""));
process.exit(fail ? 1 : 0);
