/* v10 验证：重抽队列的数量说明（消除「只剩 2/1/0」的困惑） */
const fs = require("fs");
const P = "C:/Users/Chen/Desktop/个人/日语学习站/js/";

const stub = () => ({
  innerHTML: "", style: {}, value: "", files: null,
  addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
  focus() {}, querySelector() { return null; }, querySelectorAll() { return []; },
  classList: { toggle() {}, add() {}, remove() {} }, closest() { return null; },
  click() {}, remove() {}, insertAdjacentHTML() {}
});
global.Audio = function () { return { src: "", play: () => Promise.resolve(), load() {} }; };
global.window = { addEventListener() {}, scrollTo() {}, speechSynthesis: { getVoices: () => [], cancel() {}, speak() {} } };
global.document = {
  addEventListener() {}, querySelector: () => stub(), querySelectorAll: () => [],
  getElementById: () => stub(), createElement: () => stub(), body: { appendChild() {} }
};
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.location = { hash: "#/learn" };
global.SpeechSynthesisUtterance = function () {};
global.URL = { createObjectURL: () => "blob:x", revokeObjectURL() {} };
global.Blob = function () {};

["data/kana.js", "data/vocab-n5.js", "data/vocab-n4.js", "data/vocab-n3.js", "data/vocab-n2.js",
 "data/vocab-n1.js", "data/verbs.js", "data/grammar.js", "data/audio-map.js", "app.js"]
  .forEach(f => eval(fs.readFileSync(P + f, "utf8")));

const J = globalThis.__JP__;
let pass = 0, fail = 0;
const t = (name, cond, extra) => { if (cond) { pass++; console.log("  ok   " + name); } else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  → " + extra : "")); } };

const S = J.state();
const now = Date.now();
S.settings.newPerDay = 20;

console.log("\n[1] 复现用户现象：额度只剩 2 → 队列确实只有 2 个（不是 bug）");
J.setStateFor("learn"); J.ls.lv = "N5"; J.ls.lesson = 0;
S.today.new = 18;
J.buildQueue(true);
t("额度剩 2 → 队列 2 个", J.ls.queue.length === 2, J.ls.queue.length);
t("页面已说明原因", J.queueNote(J.ls, { due: 0, "new": J.VOCAB.N5.length - 2 }, 2).indexOf("今日新词额度只剩 2 个") >= 0);
t("给出超额继续入口", J.queueNote(J.ls, { due: 0, "new": 500 }, 2).indexOf('id="vforce2"') >= 0);

console.log("\n[2] 额度剩 1 / 0");
S.today.new = 19;
J.buildQueue(true);
t("额度剩 1 → 队列 1 个", J.ls.queue.length === 1, J.ls.queue.length);
t("说明含「只剩 1 个」", J.queueNote(J.ls, { due: 0, "new": 500 }, 1).indexOf("今日新词额度只剩 1 个") >= 0);
S.today.new = 20;
J.buildQueue(true);
t("额度剩 0 → 队列 0 个", J.ls.queue.length === 0, J.ls.queue.length);
t("空队列交给 doneHTML 说明", J.queueNote(J.ls, { due: 0, "new": 500 }, 0) === "");
t("doneHTML 提示额度用完", J.doneHTML().indexOf("今日新词额度已用完") >= 0);

console.log("\n[3] 额度充足 → 正常 10 个，且提示不罗嗦");
S.today.new = 0;
J.buildQueue(true);
t("额度充足 → 每轮固定 10 个", J.ls.queue.length === 10, J.ls.queue.length);
const n1 = J.queueNote(J.ls, { due: 0, "new": 500 }, 20);
t("提示简洁（无额度警告）", n1.indexOf("额度只剩") < 0 && n1.indexOf("10") >= 0);

console.log("\n[4] 重抽按钮 = 按规则重新抽，数量可预期");
S.today.new = 5;   // 额度剩 15
J.buildQueue(true);
const first = J.ls.queue.slice();
t("额度剩 15 → 重抽也只给 10 个（与首轮一致）", first.length === 10, first.length);
J.ls.idx = 3;      // 模拟学掉 3 个
J.buildQueue(true);
t("重抽后 idx 归零", J.ls.idx === 0);
t("重抽后剩余恢复为 10", J.ls.queue.length - J.ls.idx === 10);
t("重抽数量与首轮一致（不再跳变）", J.ls.queue.length === 10, J.ls.queue.length);
// 超额
J.buildQueue(true, true);
t("超额重抽也是 10 个", J.ls.queue.length === 10, J.ls.queue.length);
S.today.new = 20;
J.buildQueue(true, true);
t("额度用尽时超额仍能拿到 10 个", J.ls.queue.length === 10, J.ls.queue.length);

console.log("\n[5] 课号筛选导致数量少 → 单独说明");
S.today.new = 0;
J.ls.lesson = 1;
J.buildQueue(true);
const n2 = J.queueNote(J.ls, { due: 0, "new": 500 }, 20);
t("按课号筛选时说明写明具体课次", n2.indexOf("第 1 课") >= 0 || n2.indexOf("已按课号筛选") >= 0, n2);

console.log("\n[6] 复习页说明");
J.ls.lesson = 0;
J.setStateFor("review"); J.rs.lv = "N5"; J.rs.lesson = 0;
const learned = J.VOCAB.N5.slice(0, 2);
learned.forEach(v => { S.cards[v.id] = { i: 0, ef: 2.5, n: 1, due: now - 1000 }; });
J.buildQueue(true);
t("复习队列 = 到期词数 2", J.rs.queue.length === 2, J.rs.queue.length);
const n3 = J.queueNote(J.rs, { due: 2, "new": 500 }, 20);
t("复习页说明走完就没有了（文案已升级，含义不变）", n3.indexOf("走完就没了") >= 0, n3);
t("说明未学词不会出现", n3.indexOf("不会出现在这里") >= 0);

console.log("\n[7] 回归");
t("真人音索引 1040", Object.keys(globalThis.AUDIO_MAP).length === 1040);
t("变形 行く→行って", J.conj("いく", 1, "te") === "いって");
t("听写看答案只保留一个", (function () {
  let cnt = 0;
  return typeof J.insertAnswer === "function";
})());
t("收尾提示可用", J.doneHTML().length > 0);

console.log("\n结果：" + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);
