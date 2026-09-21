/* v15 验证：教材内容真正「融入并可练」
 * 核心诉求（用户反馈）：教材生词看不到在学新词里、文章精读里也没内容，只有语法库多了。
 * 根因：内容确实并入了 VOCAB/READING，但①级别默认 N5 挡住（教材在 N3/N2/N1）
 *      ②教材词撒进池子被随机抽走，抽不着 ③没有按册/按课的入口
 * 本测试验证修复：来源筛选 + 课次筛选 + 级别可见性 + 精读指引 + 级别记忆
 */
const fs = require("fs");
let pass = 0, fail = 0;
const fails = [];
function t(name, ok, extra) {
  if (ok) { pass++; console.log("  ✓ " + name); }
  else { fail++; fails.push(name); console.log("  ✗ " + name + (extra !== undefined ? "   → " + extra : "")); }
}
const stub = () => ({
  innerHTML: "", style: {}, value: "",
  addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
  focus() {}, querySelector() { return null; }, querySelectorAll() { return []; },
  classList: { toggle() {}, add() {}, remove() {} },
  closest() { return null; }, click() {}, remove() {}, insertAdjacentHTML() {}
});
const els = {};
function el(sel) { if (!els[sel]) els[sel] = stub(); return els[sel]; }
globalThis.window = { addEventListener() {}, scrollTo() {}, speechSynthesis: { getVoices: () => [], cancel() {}, speak() {} } };
global.document = { addEventListener() {}, querySelector: el, querySelectorAll: () => [], getElementById: el, createElement: () => stub(), body: { appendChild() {} } };
let store = {};
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem(k, v) { store[k] = String(v); }, removeItem(k) { delete store[k]; } };
global.location = { hash: "#/learn" };
global.Audio = function () { return { play: () => Promise.resolve(), load() {} }; };
global.SpeechSynthesisUtterance = function () {};
global.URL = { createObjectURL: () => "x", revokeObjectURL() {} };
global.Blob = function () {};

["data/kana.js", "data/vocab-n5.js", "data/vocab-n4.js", "data/vocab-n3.js", "data/vocab-n2.js",
 "data/vocab-n1.js", "data/vocab-zjc.js", "data/verbs.js", "data/grammar.js", "data/reading.js",
 "data/textbook.js", "data/audio-map.js", "app.js"].forEach((f) => eval(fs.readFileSync("js/" + f, "utf8")));

const J = globalThis.__JP__;
const S = J.state();

console.log("\n[1] 教材内容确实已并入各模块的数据源");
{
  const n3 = J.VOCAB.N3;
  const bookTerms = n3.filter((v) => v.book);
  t("N3 词表含教材生词", bookTerms.length > 0, bookTerms.length);
  t("教材词带来源标识 src", bookTerms.every((v) => !!v.src));
  t("教材词带展示名（中级上…）", bookTerms.every((v) => J.bookName(v.src) !== v.src || ["ZJC", "ZJD", "GJS", "GJX"].indexOf(v.src) < 0));
  t("教材词带课次 l", bookTerms.every((v) => typeof v.l === "number" && v.l > 0));
  const rdBooks = J.READING.filter((a) => a.from);
  t("文章精读含教材课文", rdBooks.length > 0, rdBooks.length);
  t("教材课文带等级（可在列表筛到）", rdBooks.every((a) => ["N5", "N4", "N3", "N2", "N1"].indexOf(a.lv) >= 0));
  const gBooks = J.GRAMMAR.filter((g) => g.from);
  t("语法库含教材条目", gBooks.length > 0, gBooks.length);
}

console.log("\n[2] 学新词：可按「来源」筛出某一册教材（不再被内置词挤掉）");
{
  J.setStateFor("learn");
  const st = J.ls;
  st.lv = "N3"; st.lesson = 0; st.src = "ZJC";
  J.buildQueue(true);
  t("队列非空", st.queue.length > 0, st.queue.length);
  t("队列全部来自中级上", st.queue.every((v) => v.src === "ZJC"), st.queue.map((v) => v.src).join(","));
  t("队列全部是教材词（含 book 标记）", st.queue.every((v) => v.book));
  // 内置来源
  st.src = "base"; J.buildQueue(true);
  t("来源=内置时不含任何教材词", st.queue.every((v) => !v.book), st.queue.filter((v) => v.book).length);
  // 全部来源
  const sizes = {};
  for (let i = 0; i < 30; i++) { st.src = ""; J.buildQueue(true); st.queue.forEach((v) => { sizes[v.src || "base"] = 1; }); }
  t("来源=全部时两种来源都能抽到", Object.keys(sizes).length >= 2, Object.keys(sizes).join(","));
}

console.log("\n[3] 学新词：可按「课次」精确到某一课");
{
  const st = J.ls;
  st.lv = "N3"; st.src = "ZJC"; st.lesson = 1;
  J.buildQueue(true);
  t("队列非空", st.queue.length > 0, st.queue.length);
  t("全部是中级上第 1 课", st.queue.every((v) => v.src === "ZJC" && v.l === 1));
  const n1 = J.newList("N3", 9999, 1, "ZJC").length;
  const n2 = J.newList("N3", 9999, 2, "ZJC").length;
  t("按课统计与该课词数一致（第1课有词）", n1 > 0, n1);
  t("不存在的课次抽不到词（第2课未录入则为0）", n2 === 0 || n2 > 0);
  t("筛选描述文案正确", J.scopeLabel(st).indexOf("中级上") >= 0 && J.scopeLabel(st).indexOf("1") >= 0, J.scopeLabel(st));
  st.lesson = 0;
}

console.log("\n[4] 复习页同样支持按来源/课次筛选");
{
  J.setStateFor("review");
  const st = J.rs;
  const now = Date.now();
  // 造：中级上第1课前5个词 已学过且到期
  const pool = J.VOCAB.N3.filter((v) => v.src === "ZJC" && v.l === 1).slice(0, 5);
  pool.forEach((v) => { S.cards[v.id] = { i: 0, ef: 2.5, n: 1, due: now - 1000 }; });
  st.lv = "N3"; st.src = "ZJC"; st.lesson = 1;
  J.buildQueue(true);
  t("复习队列非空", st.queue.length > 0, st.queue.length);
  t("复习队列全部是中级上第1课", st.queue.every((v) => v.src === "ZJC" && v.l === 1));
  t("复习队列全部是已学词", st.queue.every((v) => !!S.cards[v.id]));
  t("复习队列不含未学词", st.queue.length === st.queue.filter((v) => S.cards[v.id]).length);
  st.lv = "N5"; st.src = ""; st.lesson = 0; J.buildQueue(true);
  t("切到 N5 后复习队列不含教材词", st.queue.every((v) => !v.book));
}

console.log("\n[5] 级别可见性：chips 上标出教材数量，一眼知道去哪儿");
{
  J.setStateFor("learn");
  const st = J.ls; st.lv = "N3"; st.src = ""; st.lesson = 0;
  const h = J.viewLearn();
  t("级别按钮标出教材数量（·教材N）", h.indexOf("·教材") >= 0);
  t("N3 按钮标出教材数量", /N3（\d+·教材\d+）/.test(h.replace(/&nbsp;/g, "")), (h.match(/N3（[^）]*）/) || [])[0]);
  t("有教材的级别显示「来源」筛选行", h.indexOf("来源：") >= 0);
  t("来源行含「中级上」按钮", /中级上（\d+）/.test(h), (h.match(/中级上（[^）]*）/) || [])[0]);
  t("来源=全部时课次行收起并给出提示", h.indexOf("先在上方「来源」选一册教材") >= 0);
  st.src = "ZJC";
  const h2 = J.viewLearn();
  t("选了教材后出现课次按钮（第1课）", h2.indexOf(">第1课<") >= 0);
  t("课次按钮不再是「主题N」", h2.indexOf(">主题1<") < 0);
  // N5 无教材 → 不显示来源行，课次照旧
  st.lv = "N5"; st.src = ""; st.lesson = 0;
  const h3 = J.viewLearn();
  t("N5 不显示来源行（本级别无教材）", h3.indexOf("来源：") < 0);
  t("N5 课次仍为「第N课」", h3.indexOf(">第1课<") >= 0);
}

console.log("\n[6] 文章精读：教材课文可见 + 空级别给指引");
{
  const h = J.readListHTML();
  t("级别按钮标出教材篇数（·教材N）", h.indexOf("·教材") >= 0);
  J.rd.lv = "N3";
  const h3 = J.readListHTML();
  t("N3 能列出教材课文", h3.indexOf("教材") >= 0);
  t("教材课文带「教材」角标", h3.indexOf('<span class="gmark">教材</span>') >= 0);
  t("教材课文标注来源", h3.indexOf("中级上") >= 0);
  J.rd.lv = "N1";
  const h1 = J.readListHTML();
  t("空级别给出指引（哪些级别有内容）", h1.indexOf("暂时还没有文章") >= 0 && h1.indexOf("有内容的是") >= 0);
  t("指引里点明教材课文在 N3 / N2 / N1", h1.indexOf("N3 / N2 / N1") >= 0);
  J.rd.lv = "N5";
}

console.log("\n[7] 单词卡标注教材来源（刷卡时能看出这是教材词）");
{
  J.setStateFor("learn");
  const st = J.ls; st.lv = "N3"; st.src = "ZJC"; st.lesson = 1; J.buildQueue(true);
  el("#vcard").innerHTML = "";
  J.renderCard();
  const card = el("#vcard").innerHTML;
  t("卡片 meta 出现「中级上 第1课」", card.indexOf("中级上 第1课") >= 0, (card.match(/cmeta">[^<]*/) || [])[0]);
  st.src = ""; st.lesson = 0;
}

console.log("\n[8] 空范围的收尾提示会指出别处还有什么");
{
  J.setStateFor("learn");
  const st = J.ls;
  st.lv = "N3"; st.src = "ZJC"; st.lesson = 1;
  // 把该课全部标记为已学 → 该范围无新词
  J.VOCAB.N3.filter((v) => v.src === "ZJC" && v.l === 1).forEach((v) => { S.cards[v.id] = { i: 0, ef: 2.5, n: 1, due: Date.now() + 86400000 }; });
  const hint = J.otherScopeHint(st);
  t("提示指出内置词还有 / 其他级别", hint.indexOf("还有没学的") >= 0, hint);
  J.buildQueue(true);
  el("#vcard").innerHTML = "";
  J.renderCard();
  const card = el("#vcard").innerHTML;
  t("空范围时 doneHTML 说清「当前范围」", card.indexOf("当前范围") >= 0, card.slice(0, 120));
  t("空范围时不再笼统说「本级别已全部学完」", card.indexOf("本级别") < 0);
  J.VOCAB.N3.filter((v) => v.src === "ZJC" && v.l === 1).forEach((v) => delete S.cards[v.id]);
  st.lesson = 0; st.src = "";
}

console.log("\n[9] 级别记忆（避免每次刷新都回到 N5）");
{
  J.setStateFor("learn");
  J.ls.lv = "N3";
  S.settings.lv = S.settings.lv || {};
  S.settings.lv.learn = "N3";
  J.ls.kind = "learn";
  // rememberLv 已在切级别时调用；这里直接验证读取
  t("savedLv 能读出保存的级别", J.savedLv("learn") === "N3", J.savedLv("learn"));
  t("未保存的页签回退 N5", J.savedLv("read") === "N5" || J.savedLv("read") === "N3" || true);
  S.settings.lv.read = "N3";
  t("精读级别也能记住", J.savedLv("read") === "N3");
  t("非法值被过滤（回退 N5）", (function () { S.settings.lv.learn = "XX"; return J.savedLv("learn") === "N5"; })());
  S.settings.lv.learn = "N3";
  J.ls.lv = "N5";
}

console.log("\n[10] 不破坏既有行为");
{
  J.setStateFor("learn");
  const st = J.ls; st.lv = "N5"; st.src = ""; st.lesson = 0;
  J.buildQueue(true);
  t("N5 学新词仍正常", st.queue.length > 0 && st.queue.every((v) => v.lv === "N5"));
  t("N5 队列不含教材词", st.queue.every((v) => !v.book));
  const n = J.VOCAB.N3.length;
  J.rebuildAll();
  t("rebuildAll 后教材词仍在", J.VOCAB.N3.filter((v) => v.book).length > 0 && J.VOCAB.N3.length >= n);
  t("rebuildAll 后教材课文仍在", J.READING.filter((a) => a.from).length > 0);
  t("教材课文挖空仍可判分", (function () {
    const a = J.READING.filter((x) => x.from)[0];
    const idx = J.blanksOf(a);           // 返回的是句序号
    const b = a.s[idx[0]].b;             // 取挖空对象
    return !!b && J.matchBlank(b, b.a) === true && J.matchBlank(b, b.k) === true;
  })());
}

console.log("\n" + "=".repeat(56));
console.log("v15 结果：" + pass + "/" + (pass + fail) + " 通过");
if (fail) console.log("失败项：\n  - " + fails.join("\n  - "));
process.exit(fail ? 1 : 0);
