/* v22 验证：已学词「随手翻看」独立页面（#/studied）
 * 背景：用户要「专门有个跟错词本一样的界面，可以随时随地看已学的单词加强记忆」。
 * 与复习页的区别：这里是**浏览**（不评分、不看到期时间），复习页是**刷卡**（评分、进 SRS）。
 * 运行：node jp_v22_verify.js（cwd = 日语学习站）
 */
const fs = require("fs");
let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra !== undefined ? "   → " + extra : "")); }
}
const els = {};
const mkEl = () => ({
  innerHTML: "", textContent: "", style: {}, value: "", selectionStart: 0,
  addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
  focus() {}, click() {}, remove() {}, insertAdjacentHTML() {},
  removeAttribute() {}, setSelectionRange() {},
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
globalThis.location = { hash: "#/studied" };
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
    classList: { _c: {}, add(c) { this._c[c] = 1; }, remove(c) { delete this._c[c]; }, toggle() {}, contains(c) { return !!this._c[c]; } },
    removeAttribute() {}, setSelectionRange() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    remove() {}, insertAdjacentHTML() {}, focus() {}, click() {}
  };
  return self;
}
function click(attrs, id) {
  const ev = { target: fakeTarget(attrs, id) };
  (handlers.click || []).forEach((fn) => fn(ev));
}
function type(id, value) {
  const ev = { target: { id: id, value: value, selectionStart: value.length } };
  (handlers.input || []).forEach((fn) => fn(ev));
}

/* ---------- 场景 ---------- */
const HOUR = 3600000, DAY = 86400000, now = Date.now();
S.cards = {}; S.today = { new: 0, rev: 0 }; S.wrong = [];
J.VOCAB.N5.slice(0, 30).forEach((v, i) => {
  if (i < 6) S.cards[v.id] = { i: 1, ef: 2.5, n: 1, due: now + 600000, ph: "l", st: -1, lp: 0 };         // 巩固中
  else if (i < 14) S.cards[v.id] = { i: 6, ef: 2.5, n: 6, due: now + DAY * 9, ph: "r", st: 1, lp: 0 };  // 学得牢
  else S.cards[v.id] = { i: 2, ef: 2.5, n: 2, due: now - HOUR * 2, ph: "r", st: 1, lp: 0 };            // 待巩固·已逾期
});
const bookWords = J.VOCAB.N3.filter((v) => v.book).slice(0, 5);
bookWords.forEach((v) => { S.cards[v.id] = { i: 2, ef: 2.5, n: 2, due: now + DAY, ph: "r", st: 1, lp: 0 }; });
S.wrong = [J.VOCAB.N5[20].id, J.VOCAB.N5[21].id];

const sv = J.sv;
function reset() { sv.lv = ""; sv.src = ""; sv.lesson = 0; sv.st = "all"; sv.sort = "due"; sv.q = ""; sv.limit = 80; sv.hideZ = false; }
reset();

console.log("\n[1] learnedRows：只含学过的词，不看到期时间");
{
  const rows = J.learnedRows();
  t("总数 = 30(N5) + 5(教材)", rows.length === 35, rows.length);
  t("全部都有 cards 记录（= 学过的）", rows.every((r) => !!S.cards[r.v.id]));
  t("不含没学过的词", rows.every((r) => J.VOCAB.N5.indexOf(r.v) >= 0 || J.VOCAB.N3.indexOf(r.v) >= 0));
  t("包含已逾期的词", rows.some((r) => r.c.due < now));
  t("包含未到期的词（不看到期时间）", rows.some((r) => r.c.due > now));
  t("N5 只学到第 30 个 → 第 31 个不出现", !rows.some((r) => r.v.id === J.VOCAB.N5[30].id));
}

console.log("\n[2] 排序：四种方式");
{
  reset(); sv.sort = "due";
  let rows = J.learnedRows();
  let ok = true;
  for (let i = 1; i < rows.length; i++) if ((rows[i - 1].c.due || 0) > (rows[i].c.due || 0)) ok = false;
  t("「最久没复习」= due 升序", ok, J.dueLabel(rows[0].c));

  sv.sort = "weak";
  rows = J.learnedRows();
  ok = true;
  for (let i = 1; i < rows.length; i++) if ((rows[i - 1].c.n || 0) > (rows[i].c.n || 0)) ok = false;
  t("「最不熟」= 复习次数升序", ok, rows.map((r) => r.c.n).slice(0, 6).join(","));
  t("最不熟的排最前（n=1 的巩固中词）", rows[0].c.n === 1, rows[0].c.n);

  sv.sort = "kana";
  const a = J.learnedRows().map((r) => r.v.id).join(",");
  const b = J.VOCAB.N5.filter((v) => S.cards[v.id]).map((v) => v.id).concat(bookWords.map((v) => v.id)).join(",");
  t("「按五十音」= 保持词典原序", a === b, a.slice(0, 40));

  sv.sort = "lesson";
  rows = J.learnedRows();
  ok = true;
  for (let i = 1; i < rows.length; i++) if ((rows[i - 1].v.l || 0) > (rows[i].v.l || 0)) ok = false;
  t("「按课次」= 课号升序", ok);
}

console.log("\n[3] 状态筛选五档");
{
  reset();
  const cnt = (k) => {
    sv.st = k;
    const n = J.learnedRows().length;
    sv.st = "all";
    return n;
  };
  const cAll = cnt("all"), cLearn = cnt("learning"), cSolid = cnt("solid"), cWeak = cnt("weak"), cWrong = cnt("wrong");
  t("全部 = 35", cAll === 35, cAll);
  t("巩固中 = 6", cLearn === 6, cLearn);
  t("学得牢 = 8", cSolid === 8, cSolid);
  t("待巩固 = 21（其他都有 n=2）", cWeak === 21, cWeak);
  t("错词 = 2", cWrong === 2, cWrong);
  t("四类相加 = 全部（互斥不重叠）", cLearn + cSolid + cWeak === cAll, cLearn + cSolid + cWeak);

  sv.st = "solid";
  t("学得牢筛选：全部 n>=4 且非学习中", J.learnedRows().every((r) => (r.c.n || 0) >= 4 && !J.isLearning(r.c)));
  sv.st = "weak";
  t("待巩固筛选：全部 n<4 且非学习中", J.learnedRows().every((r) => (r.c.n || 0) < 4 && !J.isLearning(r.c)));
  sv.st = "wrong";
  t("错词筛选：全在错词本", J.learnedRows().every((r) => S.wrong.indexOf(r.v.id) >= 0));
  sv.st = "learning";
  t("巩固中筛选：全是学习中", J.learnedRows().every((r) => J.isLearning(r.c)));
  sv.st = "all";
}

console.log("\n[4] 级别 / 来源 / 课次筛选");
{
  reset();
  sv.lv = "N5";
  t("切 N5 → 30 个", J.learnedRows().length === 30, J.learnedRows().length);
  sv.lv = "N3";
  t("切 N3 → 5 个（全是教材词）", J.learnedRows().length === 5 && J.learnedRows().every((r) => r.v.book));
  sv.lv = "N4";
  t("切没学过的 N4 → 0 个（不误给别的级别）", J.learnedRows().length === 0);
  sv.lv = "N5"; sv.src = "base";
  t("N5 + 内置 → 30 个", J.learnedRows().length === 30, J.learnedRows().length);
  sv.lv = "N3"; sv.src = "ZJC";
  t("N3 + 中级上 → 5 个", J.learnedRows().length === 5, J.learnedRows().length);
  const L = bookWords[0].l;
  sv.lesson = L;
  t("再叠加课次 → 只剩该课", J.learnedRows().every((r) => r.v.l === L), J.learnedRows().length);
  reset();
}

console.log("\n[5] 搜索：假名 / 汉字 / 中文都能命中");
{
  reset();
  const target = J.VOCAB.N5[0];
  sv.q = target.k;
  t("按假名搜得到", J.learnedRows().some((r) => r.v.id === target.id), target.k);
  sv.q = String(target.z).slice(0, 2);
  t("按中文释义搜得到", J.learnedRows().some((r) => r.v.id === target.id), target.z + " ← 搜「" + String(target.z).slice(0, 2) + "」");
  const withKanji = J.VOCAB.N5.slice(0, 30).filter((v) => v.w)[0];
  if (withKanji) {
    sv.q = withKanji.w;
    t("按汉字搜得到", J.learnedRows().some((r) => r.v.id === withKanji.id), withKanji.w);
  } else { t("按汉字搜得到（本次无带汉字词，跳过）", true); }
  sv.q = "この語は存在しないはず";
  t("搜不到 → 空结果", J.learnedRows().length === 0);
  sv.q = "";
  t("清空搜索 → 恢复", J.learnedRows().length === 35);
}

console.log("\n[6] 分页：limit + 加载更多");
{
  reset(); sv.limit = 10;
  let h = J.viewStudied();
  t("只渲染 10 条", (h.match(/class="svrow"/g) || []).length === 10, (h.match(/class="svrow"/g) || []).length);
  t("给出「加载更多」并标出剩余数", h.indexOf("加载更多（还有 25 个）") >= 0, (h.match(/加载更多[^<]*/) || [])[0]);
  click({}, "svmore");
  t("点加载更多 → limit 增加", sv.limit === 90, sv.limit);
  h = J.viewStudied();
  t("渲染全部 35 条", (h.match(/class="svrow"/g) || []).length === 35, (h.match(/class="svrow"/g) || []).length);
  t("词少时不再显示加载更多", h.indexOf("加载更多") < 0);
  reset();
}

console.log("\n[7] 遮蔽释义（先自己想，再核对）");
{
  reset();
  let h = J.viewStudied();
  t("默认不遮蔽", h.indexOf("svzh blind") < 0 && h.indexOf("svblind") >= 0);
  t("开关显示「关」", /svblind[^>]*>遮蔽释义：关/.test(h), (h.match(/id="svblind"[^>]*>[^<]*/) || [])[0]);

  click({}, "svblind");
  t("点开关 → 开启遮蔽", sv.hideZ === true);
  h = J.viewStudied();
  const blindN = (h.match(/class="svzh blind"/g) || []).length;
  t("渲染出的释义都被遮住", blindN === 35, blindN);
  t("被遮住的条目标了可点击", (h.match(/data-svz=/g) || []).length === 35);

  const id = J.VOCAB.N5[0].id;
  const fakeNode = fakeTarget({ "data-svz": id });
  const ev = { target: fakeNode };
  (handlers.click || []).forEach((fn) => fn(ev));
  t("点单条 → 该条被揭示", (function () {
    const h = J.viewStudied();
    return h.indexOf('data-svz="' + id + '"') < 0;
  })(), "该条不应再有 data-svz");
  h = J.viewStudied();
  t("其余词仍被遮住", (h.match(/class="svzh blind"/g) || []).length === 34,
    (h.match(/class="svzh blind"/g) || []).length);

  click({}, "svblind");
  t("再点开关 → 关闭遮蔽", sv.hideZ === false);
  reset();
}

console.log("\n[8] 朗读按钮");
{
  reset();
  const h = J.viewStudied();
  const n = (h.match(/data-svsay="/g) || []).length;
  t("每条都有朗读按钮", n === 35, n);
  t("按钮带词 id", h.indexOf('data-svsay="' + J.VOCAB.N5[0].id + '"') >= 0);
}

console.log("\n[9] 用这些词练一遍（跳到复习页，不丢筛选）");
{
  reset();
  sv.lv = "N3"; sv.src = "ZJC"; sv.lesson = bookWords[0].l; sv.st = "all";
  click({}, "svtrain");
  t("复习页级别跟着走", J.rs.lv === "N3", J.rs.lv);
  t("来源跟着走", J.rs.src === "ZJC", J.rs.src);
  t("课次跟着走", J.rs.lesson === bookWords[0].l, J.rs.lesson);
  t("模式设为「全部已学」", J.rs.rmode === "all", J.rs.rmode);
  t("跳转到复习页", globalThis.location.hash === "#/review", globalThis.location.hash);

  reset();
  sv.lv = "N5"; sv.st = "wrong";
  click({}, "svtrain");
  t("状态=错词 → 用「只练错词」模式", J.rs.rmode === "wrong", J.rs.rmode);

  reset();
  sv.lv = "";   // 未选级别
  click({}, "svtrain");
  t("未选级别 → 自动取第一个有已学词的级别", J.rs.lv === "N5", J.rs.lv);
  reset();
}

console.log("\n[10] 浏览不评分、不动 SRS（与复习页的本质区别）");
{
  reset();
  const snap = JSON.stringify(S.cards);
  const revBefore = S.today.rev;
  J.learnedRows(); J.learnedStats(); J.viewStudied();
  t("渲染后 cards 完全没变", JSON.stringify(S.cards) === snap);
  t("今日复习数没变（浏览不计分）", S.today.rev === revBefore, S.today.rev);
  t("due 没被改动", JSON.stringify(S.cards) === snap);
}

console.log("\n[11] 页面 UI 完整性与空状态");
{
  reset();
  const h = J.viewStudied();
  t("标题正确", h.indexOf("已学词 · 随手翻看") >= 0);
  t("写明「不看到期时间」", h.indexOf("不看到期时间") >= 0);
  t("写明「不评分」不影响计划", h.indexOf("不会打乱你的复习计划") >= 0);
  t("有搜索框", h.indexOf('id="svq"') >= 0);
  t("有状态筛选行", h.indexOf("状态：") >= 0);
  t("有级别筛选行", h.indexOf("级别：") >= 0);
  t("有排序行", h.indexOf("排序：") >= 0);
  t("排序有四种选项", h.indexOf("最久没复习") >= 0 && h.indexOf("最不熟") >= 0 && h.indexOf("按课次") >= 0 && h.indexOf("按五十音") >= 0);
  t("顶部统计含「已学：35 个」", h.indexOf("已学：<b>35</b> 个") >= 0, (h.match(/已学：<b>\d+<\/b>/) || [])[0]);
  t("有「用这些词练一遍」按钮", h.indexOf('id="svtrain"') >= 0);
  t("每条显示复习次数与下次复习", h.indexOf("复习 ") >= 0 && (h.indexOf("已到期") >= 0 || h.indexOf("约 ") >= 0));

  // 筛选后为空
  sv.q = "zzzz";
  const h2 = J.viewStudied();
  t("筛选后为空 → 提示换条件", h2.indexOf("这个筛选下没有词") >= 0, h2.slice(h2.indexOf("svempty"), h2.indexOf("svempty") + 80));
  t("空结果时不误说「还没有学过的词」", h2.indexOf("还没有学过的词") < 0);
  sv.q = "";

  // 完全没学过
  const bak = S.cards; S.cards = {};
  const h3 = J.viewStudied();
  t("从没学过 → 提示去学新词", h3.indexOf("还没有学过的词") >= 0 && h3.indexOf('data-go="learn"') >= 0);
  S.cards = bak;
  reset();
}

console.log("\n[12] 与错词本 / 复习页互不冲突");
{
  reset();
  globalThis.location.hash = "#/wrong"; J.render();
  const hw = els["#app"].innerHTML;
  t("错词本仍正常渲染", hw.indexOf("错词本") >= 0 && hw.indexOf("开始重练") >= 0);
  t("错词本不受已学词页状态影响", hw.indexOf("svrow") < 0);
  globalThis.location.hash = "#/studied"; J.render();

  J.setStateFor("review");
  J.rs.rmode = "due"; J.buildQueue(false);
  t("复习页 due 模式仍只出到期词", J.rs.queue.every((v) => S.cards[v.id].due <= Date.now()));
  t("复习页不出现已学词页的标记", J.viewReview().indexOf("data-svsay") < 0);

  // dueLabel 各种情况
  t("dueLabel 学习中", J.dueLabel({ ph: "l", st: -1, n: 0 }) === "当天巩固中");
  t("dueLabel 已逾期（小时）", /已到期 \d+ 小时/.test(J.dueLabel({ i: 2, n: 2, due: now - HOUR * 3 })), J.dueLabel({ i: 2, n: 2, due: now - HOUR * 3 }));
  t("dueLabel 未到 24h 内", /约 \d+ 小时后/.test(J.dueLabel({ i: 1, n: 1, due: now + HOUR * 5 })), J.dueLabel({ i: 1, n: 1, due: now + HOUR * 5 }));
  t("dueLabel 超过一天", /约 \d+ 天后/.test(J.dueLabel({ i: 6, n: 6, due: now + DAY * 9 })), J.dueLabel({ i: 6, n: 6, due: now + DAY * 9 }));

  // 路由存在
  t("路由表已注册 #/studied", (function () {
    globalThis.location.hash = "#/studied";
    J.render();
    return els["#app"].innerHTML.indexOf("已学词 · 随手翻看") >= 0;
  })());
}

console.log("\n" + (fail ? "✗" : "✓") + " v22 结果：" + pass + "/" + (pass + fail) + " 通过");
if (fail) process.exitCode = 1;
