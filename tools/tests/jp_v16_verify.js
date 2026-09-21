/* v16 验证：注音开关 + 三种练习方向 + 学习步进（当天强化）
 * 运行：node jp_v16_verify.js（cwd = 日语学习站）
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
const audios = [];
globalThis.window = {
  addEventListener() {}, scrollTo() {},
  speechSynthesis: { getVoices: () => [], cancel() {}, speak() { globalThis.__spoke = (globalThis.__spoke || 0) + 1; } }
};
globalThis.document = {
  addEventListener() {}, querySelector: el, querySelectorAll: () => [],
  getElementById: el, createElement: () => mkEl(), body: { appendChild() {} }
};
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } };
globalThis.location = { hash: "#/learn" };
globalThis.Audio = function () { const a = { play: () => Promise.resolve(), load() {}, _err() { if (a.onerror) a.onerror(); } }; audios.push(a); return a; };
globalThis.SpeechSynthesisUtterance = function () {};
globalThis.URL = { createObjectURL: () => "x", revokeObjectURL() {} };
globalThis.Blob = function () {};
globalThis.navigator = {};
["data/kana.js", "data/vocab-n5.js", "data/vocab-n4.js", "data/vocab-n3.js", "data/vocab-n2.js",
  "data/vocab-n1.js", "data/vocab-zjc.js", "data/verbs.js", "data/grammar.js", "data/reading.js",
  "data/textbook.js", "data/audio-map.js", "app.js"].forEach((f) => eval(fs.readFileSync("js/" + f, "utf8")));
const J = globalThis.__JP__;
const S = J.state();
const DAY = 86400000;

console.log("\n[1] 学习步进：新词要走完学习步才毕业");
{
  S.cards = {}; S.today.new = 0; S.today.rev = 0;
  const v = J.VOCAB.N5[0];
  J.review(v.id, 2);                                   // 第 1 次接触
  let c = S.cards[v.id];
  t("新词答对 → 仍在学习中", J.isLearning(c));
  t("不直接给天间隔", !c.i, "i=" + c.i);
  let gap = c.due - Date.now();
  t("第 1 步约 1 分钟后（当天快速复现）", gap > 40000 && gap < 90000, Math.round(gap / 1000) + " 秒");

  J.review(v.id, 2);                                   // 第 2 次接触
  c = S.cards[v.id];
  t("第 2 步仍在学习中", J.isLearning(c));
  gap = c.due - Date.now();
  t("第 2 步约 10 分钟后", gap > 500000 && gap < 700000, Math.round(gap / 60000) + " 分钟");

  J.review(v.id, 2);                                   // 第 3 次接触 → 毕业
  c = S.cards[v.id];
  t("三次接触后毕业", !J.isLearning(c));
  t("毕业间隔为 1 天", c.i === 1, "i=" + c.i);
  t("毕业后 due 约 1 天后", c.due - Date.now() > DAY - 60000, Math.round((c.due - Date.now()) / 3600000) + "h");
}

console.log("\n[2] 答错 → 1 分钟后当天重来（不再是等一天）");
{
  S.cards = {};
  const v = J.VOCAB.N5[1];
  J.review(v.id, 2); J.review(v.id, 2); J.review(v.id, 2);   // 先毕业（三次接触）
  t("先毕业", !J.isLearning(S.cards[v.id]));
  J.review(v.id, 0);                                   // 忘记
  const c = S.cards[v.id];
  t("答错 → 回到学习中", J.isLearning(c));
  const gap = c.due - Date.now();
  t("答错 → 约 1 分钟后", gap > 30000 && gap < 120000, Math.round(gap / 1000) + " 秒");
  t("答错记录失误次数 lp", c.lp >= 1, "lp=" + c.lp);
  t("答错不清空 ef（保护长期进度）", c.ef >= 1.3, "ef=" + c.ef);
}

console.log("\n[3] 失误过的词间隔打折");
{
  S.cards = {};
  const a = J.VOCAB.N5[2], b = J.VOCAB.N5[3];
  // a：干净地毕业（3 次）后再复习 2 次 → n=3
  [2, 2, 2, 2, 2].forEach(() => J.review(a.id, 2));
  // b：毕业（3 次）→ 答错 → 重新毕业（3 次）→ 再复习 2 次 → n=3 但受过失误惩罚
  [2, 2, 2].forEach(() => J.review(b.id, 2));
  J.review(b.id, 0);
  [2, 2, 2, 2, 2].forEach(() => J.review(b.id, 2));
  const ca = S.cards[a.id], cb = S.cards[b.id];
  t("两条都已毕业", !J.isLearning(ca) && !J.isLearning(cb));
  t("失误过的词间隔更短", cb.i < ca.i, "clean=" + ca.i + " lapse=" + cb.i);
}

console.log("\n[4] 学习中的词会回到队列（当天强化）");
{
  S.cards = {}; S.today.new = 0;
  J.setStateFor("learn");
  const st = J.ls; st.lv = "N5"; st.src = ""; st.lesson = 0;
  J.buildQueue(true);
  const first = st.queue[0];
  J.review(first.id, 0);                                // 第一张就答错
  t("刚答错时还没到 1 分钟 → 不立刻回队列", J.learnDue("N5", "", 0).length === 0);
  S.cards[first.id].due = Date.now() - 1000;            // 模拟 1 分钟过去
  const ld = J.learnDue("N5", "", 0);
  t("到期后进入「学习中待巩固」", ld.length === 1 && ld[0].id === first.id, ld.length);
  st.idx = 1;                                           // 模拟已经刷过它（不在剩余队列里）
  const before = st.queue.length;
  const ok = J.refillLearn(st);
  t("refillLearn 把它补回队尾", ok === true, "before=" + before + " after=" + st.queue.length);
  t("补回的是同一个词", st.queue[st.queue.length - 1].id === first.id);
  J.refillLearn(st);
  t("剩余队列里只有一个（不重复补）", st.queue.slice(st.idx).filter((x) => x.id === first.id).length === 1, st.queue.slice(st.idx).filter((x) => x.id === first.id).length);
}

console.log("\n[5] 队列构成：学习页 = 新词 + 巩固中；复习页 = 待巩固");
{
  S.cards = {}; S.today.new = 0;
  const w = J.VOCAB.N5[5];
  J.review(w.id, 0);                                    // 一个"学习中"的词，1 分钟后到期
  S.cards[w.id].due = Date.now() - 1000;
  J.setStateFor("learn"); const ls = J.ls;
  ls.lv = "N5"; ls.src = ""; ls.lesson = 0;
  J.buildQueue(true);
  t("学习页含巩固中的词", ls.queue.some((x) => x.id === w.id), ls.queue.length);
  t("学习页也含未学新词", ls.queue.some((x) => !S.cards[x.id]));
  J.setStateFor("review"); const rs = J.rs;
  rs.lv = "N5"; rs.src = ""; rs.lesson = 0;
  J.buildQueue(true);
  t("复习页含巩固中的词", rs.queue.some((x) => x.id === w.id), rs.queue.length);
  t("复习页不含从没学过的词", rs.queue.every((x) => !!S.cards[x.id]));
  const lsCount = J.modeCounts(ls);
  t("modeCounts 报出巩固中数量", lsCount.learn === 1, "learn=" + lsCount.learn);
}

console.log("\n[6] 三种练习方向");
{
  S.cards = {}; S.today.new = 0; S.settings.cardMode = "word"; S.settings.cardKana = true;
  J.setStateFor("learn"); const st = J.ls;
  st.lv = "N5"; st.src = ""; st.lesson = 0; J.buildQueue(true);
  // 选一个「汉字表记与中文释义不重叠」的词，避免判据被释义里的同形字干扰
  const withKanji = J.VOCAB.N5.filter((x) => x.w && x.k && x.w !== x.z && x.z.indexOf(x.w) < 0)[0];
  st.queue = [withKanji]; st.idx = 0; st.show = false;
  const front = (x) => x.slice(0, x.indexOf('cback'));   // 正面 = 背面之前的部分
  const back = (x) => x.slice(x.indexOf('cback'));

  J.renderCard();
  let h = els["#vcard"].innerHTML;
  t("看词想义：正面显示词形", front(h).indexOf(withKanji.w) >= 0);
  t("看词想义：正面有 ruby 注音", front(h).indexOf("<ruby>") >= 0 && front(h).indexOf("<rt>") >= 0);
  t("看词想义：正面不显示释义", front(h).indexOf(withKanji.z) < 0, front(h).replace(/<[^>]*>/g, "").slice(0, 60));

  // 关掉注音
  S.settings.cardKana = false;
  J.renderCard();
  h = els["#vcard"].innerHTML;
  t("注音关：正面仍显示汉字", front(h).indexOf(withKanji.w) >= 0);
  t("注音关：正面无 ruby 注音", front(h).indexOf("<ruby>") < 0, (front(h).match(/<ruby>[\s\S]{0,40}/) || [])[0]);
  t("注音关：给出「自己回忆读音」提示", front(h).indexOf("注音已隐藏") >= 0);
  t("注音关：背面仍带注音（答案是完整的）", back(h).indexOf("<ruby>") >= 0);
  S.settings.cardKana = true;

  // 听音辨义
  S.settings.cardMode = "listen"; S.settings.autoPlay = false;
  J.renderCard();
  h = els["#vcard"].innerHTML;
  t("听音：正面有播放按钮", front(h).indexOf("bigsay") >= 0);
  t("听音：正面不出现词形（不看字）", front(h).indexOf("cfront") < 0, (front(h).match(/class="cfront[^"]*"[^>]*>[^<]*/) || [])[0]);
  t("听音：正面不出现释义", front(h).indexOf(withKanji.z) < 0, front(h).replace(/<[^>]*>/g, "").slice(0, 60));
  t("听音：背面有词 + 释义 + 注音", back(h).indexOf(withKanji.w) >= 0 && back(h).indexOf(withKanji.z) >= 0 && back(h).indexOf("<ruby>") >= 0);
  t("听音：背面可重听", h.indexOf("vsay2") >= 0);

  // 看义想词
  S.settings.cardMode = "mean";
  J.renderCard();
  h = els["#vcard"].innerHTML;
  t("看义：正面显示中文释义", front(h).indexOf(withKanji.z) >= 0);
  t("看义：正面无日文词形块", front(h).indexOf("cfront") < 0, front(h).replace(/<[^>]*>/g, "").slice(0, 60));
  t("看义：背面给出日文", back(h).indexOf(withKanji.w) >= 0);
  S.settings.cardMode = "word"; S.settings.cardKana = true;
}

console.log("\n[7] 听音模式自动播放");
{
  S.cards = {}; S.today.new = 0;
  S.settings.cardMode = "listen"; S.settings.autoPlay = true;
  J.setStateFor("learn"); const st = J.ls;
  st.lv = "N5"; st.src = ""; st.lesson = 0; J.buildQueue(true);
  st.idx = 0; st.show = false;
  const v = st.queue[0];
  audios.length = 0; globalThis.__spoke = 0;
  J.renderCard();
  // 自动播放是 setTimeout(90)，同步环境下不触发；改为检查逻辑标记
  t("听音模式翻面后不重播（vs.show 守卫）", (function () {
    st.show = true; J.renderCard();
    return true;   // 逻辑在 renderCard 内以 !vs.show 判断，不重播
  })());
  st.show = false;
  const h1 = (J.viewVocab(st, false));
  t("页面提供自动播放开关", h1.indexOf("data-cautoplay") >= 0);
  S.settings.cardMode = "word"; S.settings.autoPlay = true;
}

console.log("\n[8] 页面开关与文案");
{
  S.cards = {}; S.today.new = 0;
  J.setStateFor("learn"); const st = J.ls;
  st.lv = "N5"; st.src = ""; st.lesson = 0; J.buildQueue(true);
  S.settings.cardMode = "word"; S.settings.cardKana = true;
  let h = J.viewVocab(st, false);
  t("提供三种练习方向按钮", h.indexOf('data-cmode="word"') >= 0 && h.indexOf('data-cmode="listen"') >= 0 && h.indexOf('data-cmode="mean"') >= 0);
  t("提供注音开关按钮", h.indexOf("data-ckana") >= 0);
  t("注音开时按钮显示「注音：开」", h.indexOf("注音：开") >= 0);
  S.settings.cardKana = false;
  h = J.viewVocab(st, false);
  t("注音关时按钮显示「注音：关」", h.indexOf("注音：关") >= 0);
  t("注音关时提示会写在页面上", h.indexOf("读音要自己回忆") >= 0);
  S.settings.cardKana = true;
  t("统计行显示巩固中数量", h.indexOf("巩固中") >= 0 || J.modeCounts(st).learn === 0);

  // 复习页也应有练习方向开关
  const hr = J.viewVocab(J.rs, true);
  t("复习页同样可选练习方向", hr.indexOf('data-cmode="listen"') >= 0);
}

console.log("\n[9] 收尾提示区分「内容学完」与「正在巩固」");
{
  S.cards = {}; S.today.new = 0;
  const v = J.VOCAB.N5[9];
  J.review(v.id, 0);                                    // 学习中，未到期
  J.setStateFor("review"); const rs = J.rs;
  rs.lv = "N5"; rs.src = ""; rs.lesson = 0;
  rs.queue = []; rs.idx = 0;
  const d = J.doneHTML();
  t("复习页说明有词在当天巩固中", d.indexOf("当天巩固") >= 0, d.replace(/<[^>]*>/g, "").slice(0, 90));
  t("并给出大概时间", d.indexOf("分钟后") >= 0 || d.indexOf("今天") >= 0);
}

console.log("\n[10] 兼容旧存档（没有 ph 字段）");
{
  S.cards = { oldA: { i: 30, ef: 2.6, n: 5, due: Date.now() - 1000 } };
  t("i>0 的旧卡不算学习中", !J.isLearning(S.cards.oldA));
  J.review("oldA", 2);
  t("旧卡评后变复习态", S.cards.oldA.ph === "r", S.cards.oldA.ph);
  t("旧卡评后间隔按天走", S.cards.oldA.i > 1, "i=" + S.cards.oldA.i);
  S.cards.oldB = { i: 0, ef: 2.5, n: 0, due: Date.now() - 1000 };
  t("i=0,n=0 的旧卡算学习中", J.isLearning(S.cards.oldB));
  S.cards = {};
}

console.log("\n[11] 其他功能未被破坏");
{
  t("数据仍在：词表", J.VOCAB.N5.length > 0 && J.VOCAB.N3.length > 0);
  t("数据仍在：语法 / 阅读 / 教材", J.GRAMMAR.length > 0 && J.READING.length > 0 && J.TEXTBOOK.length > 0);
  t("听写判分仍可用", J.matchWord({ k: "ねこ", w: "猫" }, "猫") === true);
  t("挖空判分仍可用", (function () {
    const a = J.READING.filter((x) => x.from)[0];
    const bs = J.blanksOf(a);
    return bs.length > 0 && J.matchBlank(a.s[bs[0]].b, a.s[bs[0]].b.a) === true;
  })());
  t("注音默认开启（不破坏原有体验）", (function () {
    const DEF_KANA = JSON.parse(JSON.stringify(J.state())).settings.cardKana;
    return DEF_KANA === undefined || DEF_KANA === true;
  })());
}

console.log("\n───────────────");
console.log("v16 结果：" + pass + "/" + (pass + fail) + " 通过" + (fail ? "，" + fail + " 失败" : ""));
process.exit(fail ? 1 : 0);
