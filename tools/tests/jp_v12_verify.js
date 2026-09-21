/* v12 验证：点击命中（子元素上溯）+ 每句独立朗读按钮 */
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
global.location = { hash: "#/read" };
global.SpeechSynthesisUtterance = function () {};
global.URL = { createObjectURL: () => "blob:x", revokeObjectURL() {} };
global.Blob = function () {};

["data/kana.js", "data/vocab-n5.js", "data/vocab-n4.js", "data-vocab-n3.js".replace("data-vocab", "data/vocab"), "data/vocab-n2.js",
 "data/vocab-n1.js", "data/verbs.js", "data/grammar.js", "data/reading.js", "data/audio-map.js", "app.js"]
  .forEach(f => eval(fs.readFileSync(P + f, "utf8")));

const J = globalThis.__JP__;
let pass = 0, fail = 0;
const t = (name, cond, extra) => { if (cond) { pass++; console.log("  ok   " + name); } else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  → " + extra : "")); } };

const R = J.READING;
const art = R[0];
const rd = J.rd;

/* —— 1. 用真实 DOM 语义模拟点击命中 —— */
// 构造最简元素树，验证「点 span 也能命中父级 data-*」「点 kbd 也能命中 button id」
function mkEl(tag, attrs, children) {
  const el = {
    tagName: tag.toUpperCase(), id: (attrs && attrs.id) || "", _attrs: attrs || {},
    children: children || [], classList: { _s: [], add(c) { this._s.push(c); }, remove() {}, contains(c) { return this._s.indexOf(c) >= 0; } },
    getAttribute(n) { return this._attrs[n] !== undefined ? this._attrs[n] : null; },
    closest(sel) {
      let cur = this;
      while (cur) {
        if (sel.indexOf(",") >= 0 ? sel.split(",").some(s => matchSel(cur, s.trim())) : matchSel(cur, sel)) return cur;
        cur = cur._parent;
      }
      return null;
    }
  };
  (children || []).forEach(c => { c._parent = el; });
  return el;
}
function matchSel(el, sel) {
  if (sel.charAt(0) === "[") {
    const a = sel.slice(1, -1).split("=");
    return el.getAttribute(a[0]) !== null;
  }
  return el.tagName === sel.toUpperCase();
}
// 复刻 app.js 里的 A() 与「上溯到 button」逻辑
function A(t, n) {
  if (!t) return null;
  if (t.getAttribute && t.getAttribute(n)) return t.getAttribute(n);
  const el = t.closest ? t.closest("[" + n + "]") : null;
  return el ? el.getAttribute(n) : null;
}
function upToButton(t) { if (t && !t.id && t.closest) { const b = t.closest("button"); if (b) return b; } return t; }

console.log("\n[1] 文章列表：点标题文字也能进入文章（原 bug）");
const titleSpan = mkEl("span", { "class": "gname jp" });
const headDiv = mkEl("div", { "class": "ghead" }, [titleSpan]);
const card = mkEl("div", { "class": "gitem rdopen", "data-rdopen": "rd-n5-1" }, [headDiv]);
t("卡片本身带 data-rdopen", card.getAttribute("data-rdopen") === "rd-n5-1");
t("点内层 span → 能取到 data-rdopen", A(titleSpan, "data-rdopen") === "rd-n5-1", A(titleSpan, "data-rdopen"));
t("点中间 div → 能取到", A(headDiv, "data-rdopen") === "rd-n5-1");
t("点卡片空白 → 能取到", A(card, "data-rdopen") === "rd-n5-1");

console.log("\n[2] 单词卡评分：点数字 <kbd> 也能评分（原 bug）");
const kbd = mkEl("kbd", {}, []);
const gBtn = mkEl("button", { "class": "g again", "data-g": "0" }, [kbd]);
t("按钮带 data-g", gBtn.getAttribute("data-g") === "0");
t("点 <kbd> 数字 → 能取到 data-g", A(kbd, "data-g") === "0", A(kbd, "data-g"));

console.log("\n[3] 朗读按钮：点按钮内文字也能命中 id");
const innerSpan = mkEl("span", { "class": "badge-live" });
const vsay = mkEl("button", { id: "vsay" }, [innerSpan]);
t("原始 target 无 id", innerSpan.id === "");
t("上溯后拿到 vsay", upToButton(innerSpan).id === "vsay", upToButton(innerSpan).id);
t("直接点按钮本身不受影响", upToButton(vsay).id === "vsay");
const plainSpan = mkEl("span", { "class": "gmean" });
t("非按钮内的 span 不被误上溯", upToButton(plainSpan) === plainSpan);

console.log("\n[4] 每句都有独立朗读按钮");
rd.cur = art; rd.stage = "read"; rd.showK = true; rd.showZ = false;
let h = J.viewRead();
const sayCount = (h.match(/class="rsay"/g) || []).length;
t("朗读按钮数 = 句数（" + art.s.length + "）", sayCount === art.s.length, sayCount);
t("按钮带 data-rsay 索引", h.indexOf('data-rsay="0"') >= 0 && h.indexOf('data-rsay="' + (art.s.length - 1) + '"') >= 0);
t("正常按钮内容为喇叭图标", /data-rsay="0"[^>]*>🔊</.test(h));
  t("另有慢速按钮", /data-rslow="0"[^>]*>慢</.test(h));
t("每句另有独立序号", (h.match(/class="rnum"/g) || []).length === art.s.length);
t("序号与按钮分列两侧", h.indexOf('class="rside"') >= 0 && h.indexOf('class="rnum"') >= 0);

console.log("\n[5] 朗读按钮有播放反馈");
t("CSS 含 .rsay.playing 状态", fs.readFileSync("C:/Users/Chen/Desktop/个人/日语学习站/css/style.css", "utf8").indexOf(".rsay.playing") >= 0);
t("事件里加了 playing class", fs.readFileSync(P + "app.js", "utf8").indexOf('classList.add("playing")') >= 0);

console.log("\n[6] 列表整卡可点");
rd.cur = null;
h = J.viewRead();
t("data-rdopen 挂在 gitem 上", h.indexOf('class="gitem rdopen" data-rdopen=') >= 0);
t("不再只挂 ghead", h.indexOf('<div class="ghead rdopen"') < 0);

console.log("\n[7] 回归");
t("文章数据完整", R.length >= 12 && R.every(a => a.s.length > 0));
t("填空判分正常", J.matchBlank(art.s[J.blanksOf(art)[0]].b, "六時") === true);
t("阅读视图仍显示假名", h.length > 0 && J.readListHTML().indexOf("私の一日") >= 0);
rd.cur = art;
t("阅读页正常渲染", J.viewRead().indexOf("私の一日") >= 0);
t("真人音索引 1040", Object.keys(globalThis.AUDIO_MAP).length === 1040);
t("变形 行く→行って", J.conj("いく", 1, "te") === "いって");

console.log("\n结果：" + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);
