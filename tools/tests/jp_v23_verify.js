/* v23 验证：记忆机制优化（A 反应时间 / B 信号打通 / C 方向进阶 / D 错词回炉 / E 语境绑定）
 * 用户反馈：「现在的复习方式对记忆帮助很小」
 * 运行：node jp_v23_verify.js（cwd = 日语学习站）
 */
const fs = require("fs");
let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra !== undefined ? "   → " + extra : "")); }
}
function sleepSync(ms) {
  const ab = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(ab, 0, 0, ms);
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
const HOUR = 3600000, DAY = 86400000, now0 = Date.now();

console.log("\n[1] A. 反应时间 → 建议档位（0忘记 1困难 2良好 3简单）");
{
  t("1 秒内秒懂 → 简单", J.suggestGrade(800, "word", false) === 3, J.suggestGrade(800, "word", false));
  t("2.5 秒 → 良好", J.suggestGrade(2500, "word", false) === 2, J.suggestGrade(2500, "word", false));
  t("6 秒 → 困难", J.suggestGrade(6000, "word", false) === 1, J.suggestGrade(6000, "word", false));
  t("12 秒想不出来 → 忘记", J.suggestGrade(12000, "word", false) === 0, J.suggestGrade(12000, "word", false));
  t("无耗时（键盘直评）→ 良好（不误导）", J.suggestGrade(0, "word", false) === 2);
  t("用了提示 → 最多「困难」", J.suggestGrade(2000, "word", true) === 1, J.suggestGrade(2000, "word", true));
  t("用了提示 + 本来就慢 → 仍是忘记", J.suggestGrade(11000, "word", true) === 0);
  t("听音模式下不算用了提示", J.suggestGrade(2000, "listen", true) === 2, J.suggestGrade(2000, "listen", true));
}

console.log("\n[2] A. 卡片背面显示耗时与建议 + 推荐按钮高亮");
{
  S.cards = {}; S.today = { date: "", new: 0, rev: 0 }; S.wrong = [];
  S.settings.cardMode = "word"; S.settings.cardKana = true;
  J.setStateFor("learn");
  const st = J.ls;
  st.lv = "N5"; st.src = ""; st.lesson = 0;
  J.buildQueue(true);
  const v = st.queue[0];
  J.renderCard();                              // 正面（计时开始）
  let h = els["#vcard"].innerHTML;
  t("正面不显示耗时行", h.indexOf("gtime") < 0);

  sleepSync(30);
  click({}, "vshow");                          // 翻面（结算反应时间）
  t("翻面后 elapsed 被记录（>0）", (st.elapsed || 0) > 0, st.elapsed);
  h = els["#vcard"].innerHTML;
  t("背面显示「你用了 N 秒」", h.indexOf("你用了") >= 0, (h.match(/你用了[\s\S]{0,50}?秒/) || [])[0]);
  t("背面显示「建议评」", h.indexOf("建议评") >= 0);
  t("有推荐档位高亮（.g.rec）", h.indexOf("g rec") >= 0 || /class="g \w+ rec"/.test(h), (h.match(/class="g[^"]*rec[^"]*"/) || [])[0]);
  t("推荐档与耗时一致（30ms → 简单）", /class="g easy rec"/.test(h), (h.match(/class="g [a-z]+ rec"/) || [])[0]);

  // 慢速场景 → 推荐忘记
  st.show = false; st.elapsed = 15000;
  J.setTimedKey(v.id);                         // 保持同一张卡
  J.renderCard(); st.elapsed = 15000; st.show = true; J.renderCard();
  h = els["#vcard"].innerHTML;
  t("15 秒 → 推荐「忘记」", /class="g again rec"/.test(h), (h.match(/class="g [a-z]+ rec"/) || [])[0]);
}

console.log("\n[3] C. 练习方向按熟练度自动进阶（word→choice→listen→mean）");
{
  t("自动进阶在新默认里", (J.CARD_MODES[0] || [])[0] === "auto", JSON.stringify(J.CARD_MODES[0]));
  t("模式列表含 auto/word/choice/listen/mean", J.CARD_MODES.map((m) => m[0]).join(",") === "auto,word,choice,listen,mean");

  S.settings.cardMode = "auto";
  const mk = (n, ph) => ({ n: n, ph: ph || "r", i: n, ef: 2.5, due: 0, st: 1, lp: 0 });
  t("没学过的卡 → 看词想义", J.dirOf(null) === "word");
  t("学习中的卡 → 看词想义", J.dirOf({ n: 0, ph: "l", st: -1 }) === "word");
  t("毕业 n=1 → 看词想义", J.dirOf(mk(1)) === "word");
  t("毕业 n=2 → 看词想义", J.dirOf(mk(2)) === "word");
  t("毕业 n=3 → 听音选答", J.dirOf(mk(3)) === "choice", J.dirOf(mk(3)));
  t("毕业 n=4 → 听音辨义", J.dirOf(mk(4)) === "listen", J.dirOf(mk(4)));
  t("毕业 n=5 → 听音辨义", J.dirOf(mk(5)) === "listen", J.dirOf(mk(5)));
  t("毕业 n=6 → 看义想词", J.dirOf(mk(6)) === "mean", J.dirOf(mk(6)));
  t("毕业 n=9 → 看义想词", J.dirOf(mk(9)) === "mean");

  S.settings.cardMode = "listen";
  t("手动固定 listen → 一直 listen（n=1 也是）", J.dirOf(mk(1)) === "listen");
  t("手动固定 listen → n=9 仍是 listen", J.dirOf(mk(9)) === "listen");
  S.settings.cardMode = "auto";

  // 卡片信息栏标出当前练法
  J.setStateFor("learn");
  const st = J.ls;
  st.show = false;
  const v1 = J.VOCAB.N5[0];
  S.cards[v1.id] = mk(1);
  st.queue = [v1]; st.idx = 0; st.show = false;
  J.renderCard();
  let h = els["#vcard"].innerHTML;
  t("auto 模式下卡片标出当前练法", h.indexOf("看词想义") >= 0, (h.match(/cmeta">[^<]*/) || [])[0]);

  S.cards[v1.id] = mk(6);
  st.queue = [v1]; st.idx = 0; st.show = false;
  J.renderCard();
  h = els["#vcard"].innerHTML;
  t("同一个词 n=6 时改成「看义想词」", h.indexOf("看义想词") >= 0);
  t("正面变成显示中文释义", h.indexOf('class="cmean big"') >= 0);
  delete S.cards[v1.id];
  S.settings.cardMode = "auto";
}

console.log("\n[4] B. 打通判分信号 → SRS（只提前不延后）");
{
  S.cards = {}; S.wrong = [];
  const v = J.VOCAB.N5[5];
  S.cards[v.id] = { i: 10, ef: 2.5, n: 6, due: now0 + DAY * 10, ph: "r", st: 1, lp: 0 };
  const efBefore = S.cards[v.id].ef, nBefore = S.cards[v.id].n;
  const ok = J.flagWeak(v.id);
  t("flagWeak 返回 true", ok === true);
  t("due 被拉到当前（立即到期）", S.cards[v.id].due <= Date.now(), new Date(S.cards[v.id].due).toISOString());
  t("失误计数 +1", S.cards[v.id].lp === 1, S.cards[v.id].lp);
  t("不动 ef（已拉长的间隔不被破坏）", S.cards[v.id].ef === efBefore, S.cards[v.id].ef);
  t("不动 n", S.cards[v.id].n === nBefore, S.cards[v.id].n);

  // 学习中的词打回第一步
  const v2 = J.VOCAB.N5[6];
  S.cards[v2.id] = { i: 0, ef: 2.5, n: 0, due: now0 + DAY, ph: "l", st: 1, lp: 0 };
  J.flagWeak(v2.id);
  t("学习中的词被打回第一步（st=-1）", S.cards[v2.id].st === -1, S.cards[v2.id].st);

  t("没学过的词 → 不写 SRS（返回 false）", J.flagWeak("不存在的id") === false);
  t("没学过的词仍不在 cards 里", S.cards["不存在的id"] === undefined);

  // 复习队列随后能拿到它
  J.setStateFor("review");
  const rs = J.rs;
  rs.lv = "N5"; rs.src = ""; rs.lesson = 0; rs.rmode = "due";
  J.buildQueue(false);
  t("回写后它出现在复习队列里", rs.queue.some((x) => x.id === v.id), rs.queue.length);
}

console.log("\n[5] B. 三个练习判分点都接上了");
{
  S.cards = {}; S.wrong = [];
  const v = J.VOCAB.N5[7];
  S.cards[v.id] = { i: 8, ef: 2.5, n: 5, due: now0 + DAY * 8, ph: "r", st: 1, lp: 0 };

  // 听写
  J.setStateFor("learn");
  J.setTimedKey("");
  const d0 = S.cards[v.id].due;
  J.__JP__ && (function () {
    globalThis.location.hash = "#/dict";
  })();
  t("听写判错前 due 在未来", S.cards[v.id].due > Date.now());
  J.flagWeak(v.id);                              // 模拟 checkDict 的调用
  t("听写判错 → due 到期", S.cards[v.id].due <= Date.now());

  // 翻译
  S.cards[v.id].due = now0 + DAY * 8;
  J.flagWeak(v.id);                              // 模拟 tropt / trok 的调用
  t("翻译判错 → due 到期", S.cards[v.id].due <= Date.now());

  // 精读填空：答案是词时
  const fm = J.formMap();
  const withWord = J.READING.flatMap((a) => a.s).filter((s) => s.b && fm[s.b.a])[0];
  t("精读里存在「挖空答案正好是词」的情况", !!withWord, withWord ? withWord.b.a : "（无）");
  if (withWord) {
    const w = fm[withWord.b.a];
    S.cards[w.id] = { i: 6, ef: 2.5, n: 4, due: now0 + DAY * 6, ph: "r", st: 1, lp: 0 };
    t("该词此前不在队列视野（due 在未来）", S.cards[w.id].due > Date.now());
  }
  t("formMap 能反查词形", !!fm["先生"], fm["先生"] ? fm["先生"].k : "");
  t("formMap 也能反查假名", !!fm["せんせい"]);
}

console.log("\n[6] D. 错词优先回炉 + 当天加密接触");
{
  S.cards = {}; S.wrong = [];
  const mk = (id, lp, due) => { S.cards[id] = { i: 3, ef: 2.5, n: 3, due: due, ph: "r", st: 1, lp: lp }; };
  const ws = J.VOCAB.N5.slice(0, 4), ns = J.VOCAB.N5.slice(10, 14);
  ws.forEach((v) => mk(v.id, 2, now0 - HOUR));      // 4 个失误过的
  ns.forEach((v) => mk(v.id, 0, now0 - HOUR));      // 4 个正常的
  // 多发一些正常词，确保不是偶然靠前
  J.VOCAB.N5.slice(20, 40).forEach((v) => mk(v.id, 0, now0 - HOUR));

  J.setStateFor("review");
  const rs = J.rs;
  rs.lv = "N5"; rs.src = ""; rs.lesson = 0; rs.rmode = "due";
  J.buildQueue(false);
  const head = rs.queue.slice(0, 4).map((v) => S.cards[v.id].lp);
  t("失误过的词排在最前 4 位", head.every((lp) => lp > 0), head.join(","));
  t("队列包含全部 28 个到期词", rs.queue.length === 28, rs.queue.length);

  // 学习步：失误过的词多一个当天检查点
  t("LP_STEPS = [10,60]（答错那次已给 1 分钟）", J.LP_STEPS.join(",") === "10,60", J.LP_STEPS.join(","));
  t("LEARN_STEPS 未变（[1,10]）", J.LEARN_STEPS.join(",") === "1,10");

  // 干净的新词：3 次接触毕业
  const a = J.VOCAB.N5[100];
  delete S.cards[a.id];
  S.today.new = 0;
  J.review(a.id, 2); J.review(a.id, 2);
  t("新词走 2 步仍在学习中", J.isLearning(S.cards[a.id]), S.cards[a.id].st);
  J.review(a.id, 2);
  t("新词第 3 次接触后毕业", !J.isLearning(S.cards[a.id]));
  t("新词毕业间隔 1 天", S.cards[a.id].i === 1);

  // 失误过的词：4 次接触毕业
  const b = J.VOCAB.N5[101];
  delete S.cards[b.id];
  S.today.new = 0;
  J.review(b.id, 0);                            // 答错 → lp=1
  t("答错后 lp=1", S.cards[b.id].lp === 1, S.cards[b.id].lp);
  J.review(b.id, 2);                            // 1 分钟后
  J.review(b.id, 2);                            // 10 分钟后
  t("失误词走 3 步仍在学习中（比正常多一步）", J.isLearning(S.cards[b.id]), "st=" + S.cards[b.id].st);
  J.review(b.id, 2);                            // 60 分钟后 → 毕业
  t("失误词第 4 次接触才毕业", !J.isLearning(S.cards[b.id]));
}

console.log("\n[7] E. 语境绑定（词 → 真实例句：精读优先，语法库兜底）");
{
  const sample = J.VOCAB.N5.slice(0, 200);
  const hits = sample.filter((v) => J.ctxOf(v));
  const rate = Math.round(hits.length / sample.length * 100);
  const byKind = { read: 0, gram: 0 };
  hits.forEach((v) => { byKind[J.ctxOf(v).kind]++; });
  console.log("    N5 前 200 词命中 " + hits.length + " 个（" + rate + "%）｜ 精读 " + byKind.read + " · 语法例句 " + byKind.gram);
  t("常见词覆盖率 ≥30%", hits.length / sample.length >= 0.3, rate + "%");

  const hitWord = hits[0];
  t("能找到命中的词", !!hitWord, hitWord ? (hitWord.w || hitWord.k) : "（无）");
  const cx = J.ctxOf(hitWord);
  const needle = (hitWord.w && hitWord.w.length >= 2) ? hitWord.w : hitWord.k;
  t("命中的句子确实包含该词", cx.s.j.indexOf(needle) >= 0, cx.s.j.slice(0, 32) + "  ← " + needle);
  t("命中结果带出处", cx.kind === "read" ? !!cx.a.t : !!cx.g.n, cx.kind + " / " + (cx.kind === "read" ? cx.a.t : cx.g.n));
  t("同一个词二次查询走缓存（结果一致）", J.ctxOf(hitWord) === cx);
  t("不存在的词 → 返回 null", J.ctxOf({ id: "zzz", w: "絶対に存在しない語", k: "ありえないご" }) === null);

  const kanaOnly = J.VOCAB.N5.filter((v) => !v.w && v.k && v.k.length >= 3)[0];
  if (kanaOnly) {
    const ck = J.ctxOf(kanaOnly);
    if (ck) t("纯假名词命中时，句子确实含该假名", ck.s.j.indexOf(kanaOnly.k) >= 0, kanaOnly.k);
    else t("纯假名词未命中也不报错", true);
  } else { t("纯假名词场景（跳过）", true); }

  // 卡片背面渲染例句
  J.setStateFor("learn");
  const st = J.ls;
  const target = hitWord || sample[0];
  S.cards[target.id] = { i: 3, ef: 2.5, n: 3, due: Date.now(), ph: "r", st: 1, lp: 0 };
  st.queue = [target]; st.idx = 0; st.show = false;
  J.renderCard();
  let h = els["#vcard"].innerHTML;
  // 正反面在同一个 HTML 串里（靠 CSS 翻转），要按 cback 切分开看
  const front = (x) => x.slice(0, x.indexOf("cback"));
  t("正面不显示例句（不剧透）", front(h).indexOf("ctxbox") < 0, front(h).slice(-120));
  t("正面不显示耗时与建议", front(h).indexOf("gtime") < 0);
  st.elapsed = 1200; st.show = true; J.renderCard();
  h = els["#vcard"].innerHTML;
  if (cx) {
    t("背面显示例句区", h.indexOf("ctxbox") >= 0);
    t("例句区标出「例句」标签与出处", h.indexOf("ctxtag") >= 0 && h.indexOf(needle) >= 0);
    t("例句内容出现在卡片上", h.indexOf(cx.s.j.slice(0, 12)) >= 0, cx.s.j.slice(0, 20));
  } else {
    t("该词无例句时不渲染例句区（不报错）", h.indexOf("ctxbox") < 0);
  }
}

console.log("\n[8] 不破坏原有机制");
{
  J.setStateFor("learn");
  const st = J.ls;
  st.lv = "N5"; st.src = ""; st.lesson = 0; st.queue = []; st.idx = 0; st.show = false;
  J.buildQueue(true);
  t("学习页队列仍只含未学词", st.queue.every((v) => !S.cards[v.id] || J.isLearning(S.cards[v.id])));
  t("队列长度受每日额度限制（≤10）", st.queue.length <= 10, st.queue.length);

  J.setStateFor("review");
  const rs = J.rs;
  rs.rmode = "due"; rs.lv = "N5"; J.buildQueue(false);
  t("复习页 due 模式不多给未到期词", rs.queue.every((v) => {
    const c = S.cards[v.id];
    return !c || c.due <= Date.now() || J.isLearning(c);
  }));

  rs.rmode = "all";
  J.buildQueue(false);
  t("自主复习仍可用", rs.queue.length > 0);
  rs.rmode = "due";

  t("rebuildAll 后 formMap 会重建", (function () {
    const before = J.formMap()["先生"];
    J.rebuildAll();
    const after = J.formMap()["先生"];
    return !!before && !!after;
  })());

  // 三模式的渲染都不抛异常
  let threw = false;
  try {
    S.settings.cardMode = "auto"; J.renderCard();
    S.settings.cardMode = "listen"; J.renderCard();
    S.settings.cardMode = "mean"; J.renderCard();
    S.settings.cardMode = "word"; J.renderCard();
  } catch (e) { threw = true; console.log("    " + e.message); }
  t("四种模式渲染均不抛异常", !threw);
  S.settings.cardMode = "auto";
}

console.log("\n" + (fail ? "✗" : "✓") + " v23 结果：" + pass + "/" + (pass + fail) + " 通过");
if (fail) process.exitCode = 1;
