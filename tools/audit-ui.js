/* UI 自检：路由一致性 / 孤儿按钮 / 未使用属性 / 各页面冒烟渲染
 * 用法：node tools/audit-ui.js
 * 静态部分靠正则扫源码；动态部分构造最小 DOM 后逐页 render。
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

const app = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
const idxHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const buildJs = fs.readFileSync(path.join(ROOT, "build.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");

let problems = 0, notes = 0;
const bad = (s) => { problems++; console.log("  ✗ " + s); };
const warn = (s) => { notes++; console.log("  ! " + s); };
const ok = (s) => console.log("  ✓ " + s);

/* ============ 1. 导航 ↔ 路由表 一致性 ============ */
console.log("\n[1] 导航与路由表");
{
  const navsIdx = [...idxHtml.matchAll(/<a href="#\/([a-z0-9]+)"/g)].map((m) => m[1]);
  const navsBld = [...buildJs.matchAll(/<a href="#\/([a-z0-9]+)"/g)].map((m) => m[1]);
  const viewsBlock = (app.match(/const VIEWS = \{[\s\S]*?\n  \};/) || [""])[0];
  const views = [...viewsBlock.matchAll(/([a-z0-9]+):\s*view[A-Za-z]+/g)].map((m) => m[1]);

  ok("index.html 导航 " + navsIdx.length + " 项：" + navsIdx.join(" / "));
  if (navsIdx.join(",") !== navsBld.join(",")) {
    bad("build.js 与 index.html 导航不一致\n      index: " + navsIdx.join(",") + "\n      build: " + navsBld.join(","));
  } else { ok("build.js 与 index.html 导航完全一致"); }

  const noRoute = navsIdx.filter((n) => views.indexOf(n) < 0);
  if (noRoute.length) bad("导航项没有对应路由：" + noRoute.join(", "));
  else ok("每个导航项都有对应路由");

  const noNav = views.filter((v) => navsIdx.indexOf(v) < 0);
  if (noNav.length) warn("有路由但导航无入口（可能是兼容别名）：" + noNav.join(", "));
  else ok("没有孤立路由");

  // 视图函数是否都存在
  const missing = views.filter((v) => app.indexOf("function view" + v.charAt(0).toUpperCase() + v.slice(1)) < 0
    && !new RegExp("(const|function|let)\\s+view" + v.charAt(0).toUpperCase() + v.slice(1) + "\\b").test(app));
  const aliasOk = { vocab: "viewLearn" };   // 别名是允许的
  const realMissing = missing.filter((v) => !aliasOk[v]);
  if (realMissing.length) bad("路由指向了不存在的视图函数：" + realMissing.join(", "));
  else ok("路由指向的视图函数都存在");
}

/* ============ 2. 孤儿按钮：生成了却没有任何处理 ============ */
console.log("\n[2] 可交互元素的事件绑定");
{
  const els = [];
  const re = /<(button|input|select|textarea)\b[^>]*?\bid="([A-Za-z0-9_-]+)"/g;
  let m;
  while ((m = re.exec(app))) els.push({ tag: m[1], id: m[2] });
  const uniq = [...new Set(els.map((e) => e.tag + ":" + e.id))].map((s) => {
    const [tag, id] = s.split(":");
    return { tag: tag, id: id };
  });

  const handled = (id) => (
    app.indexOf('t.id === "' + id + '"') >= 0 ||
    app.indexOf("t.id === '" + id + "'") >= 0 ||
    app.indexOf('e.target.id === "' + id + '"') >= 0 ||
    app.indexOf('getElementById("' + id + '")') >= 0 ||
    app.indexOf('$("#' + id + '")') >= 0 ||
    app.indexOf("$('#" + id + "')") >= 0 ||
    app.indexOf('querySelector("#' + id + '")') >= 0
  );

  const orphans = uniq.filter((e) => !handled(e.id));
  ok("扫描到 " + uniq.length + " 个带 id 的交互元素");
  if (orphans.length) orphans.forEach((o) => bad("孤儿元素（生成了但无人处理）：<" + o.tag + ' id="' + o.id + '">'));
  else ok("没有孤儿按钮 / 输入框");
}

/* ============ 2b. 反方向：判断了 id 却从没生成过它 ============ */
console.log("\n[2b] 事件判断的 id 是否真的存在（防「判错了属性名」）");
{
  const judged = new Set();
  let m;
  const rj = /\bt\.id === "([A-Za-z0-9_-]+)"/g;
  while ((m = rj.exec(app))) judged.add(m[1]);
  const made = new Set();
  const rm = /\bid="([A-Za-z0-9_-]+)"/g;
  while ((m = rm.exec(app))) made.add(m[1]);
  const dynamic = /id="'\s*\+/.test(app);   // 存在 id="' + var + '" 这种动态生成

  const dead = [...judged].filter((k) => !made.has(k));
  // 已知情况：动态生成（id="' + bid + '"）或已改用 data-* 判断
  const known = {
    vsay: "动态生成（sayBtn(bid) 传入）",
    vsay2: "动态生成（sayBtn(bid) 传入）",
    vsay3: "听音模式大按钮，字面生成",
    vsay4: "动态生成",
    rdrestart: "已改用 data-rdrestart 判断（2026-09-21 修复）"
  };
  ok("判断了 " + judged.size + " 个 id，源码里字面生成了 " + made.size + " 个");
  const realDead = dead.filter((k) => !known[k]);
  if (dead.length) {
    dead.forEach((k) => {
      if (known[k]) ok("  " + k + " —— 已知：" + known[k]);
      else warn("判断了 t.id === \"" + k + "\"，但没有 id=\"" + k + "\" 的字面生成 —— 确认是不是写错了（或该改用 data-*）");
    });
  }
  if (!realDead.length) ok("除已知情况外，没有可疑的 id 判断");
}

/* ============ 3. data-* 属性：生成了但没人读 ============ */
console.log("\n[3] data-* 属性的读写配对");
{
  const made = new Set();
  let m;
  const re = /\bdata-([a-z0-9-]+)=/g;
  while ((m = re.exec(app))) made.add(m[1]);
  const idxMade = new Set();
  const re2 = /\bdata-([a-z0-9-]+)=/g;
  while ((m = re2.exec(idxHtml))) idxMade.add(m[1]);

  // 读取方式有三种：A("data-x") / getAttribute("data-x") / closest("[data-x]")
  const read = new Set();
  [/A\("data-([a-z0-9-]+)"\)/g, /getAttribute\("data-([a-z0-9-]+)"\)/g, /closest\("\[data-([a-z0-9-]+)\]"\)/g]
    .forEach((rx) => { let x; while ((x = rx.exec(app))) read.add(x[1]); });

  const unread = [...made].filter((k) => !read.has(k));
  ok("生成 " + made.size + " 种 data 属性，读取 " + read.size + " 种");
  if (unread.length) unread.forEach((k) => warn("生成了 data-" + k + " 但代码里从不读取（可能是漏接功能）"));
  else ok("所有生成的 data 属性都有被读取");

  const neverMade = [...read].filter((k) => !made.has(k));
  if (neverMade.length) neverMade.forEach((k) => bad("读取了 data-" + k + " 但从不生成（死代码 / 写错了属性名）"));
  else ok("所有读取的 data 属性都有被生成");
}

/* ============ 4. A() 的取值与元素生成形态是否匹配 ============ */
console.log("\n[4] 属性判定用的是 !== null 还是真值");
{
  // 值为空字符串的 data 属性（如 data-vsrc=""）用真值判断会失效，必须 !== null
  const emptyVals = [];
  let m;
  const re = /A\("(data-[a-z0-9-]+)"\)/g;
  const seen = {};
  while ((m = re.exec(app))) {
    const key = m[1];
    if (seen[key]) continue;
    seen[key] = 1;
    // 该属性是否可能被生成为空串
    if (new RegExp(key + '="\'\\s*\\+|' + key + '="\\"\\"').test(app) === false) {
      // 检查是否生成为空
      if (new RegExp(key + '="\\"\\s*\\+').test(app)) emptyVals.push(key);
    }
  }
  ok("检查了 " + Object.keys(seen).length + " 个 data 判定点");
  // 逐个人工核对结果列表（脚本给提示，最终由测试兜底）
  ["data-vsrc", "data-svsrc"].forEach((k) => {
    const line = new RegExp('if \\(A\\("' + k + '"\\) !== null\\)');
    if (!line.test(app)) bad(k + " 可能被生成为空串，但判定没有用 !== null");
    else ok(k + " 用 !== null 判定（空值安全）");
  });
}

/* ============ 5. 逐页冒烟渲染 ============ */
console.log("\n[5] 逐页冒烟渲染（空数据 + 有数据两种）");
{
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
  // 捕获点击处理器，供下面「逐篇渲染」用（事件是委托在 document 上的）
  let clickHandler = null;
  globalThis.window = { addEventListener() {}, scrollTo() {}, speechSynthesis: { getVoices: () => [], cancel() {}, speak() {} } };
  globalThis.document = {
    addEventListener(type, fn) { if (type === "click") clickHandler = fn; },
    querySelector: el, querySelectorAll: () => [],
    getElementById: el, createElement: () => mkEl(), body: { appendChild() {} }
  };
  globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } };
  globalThis.location = { hash: "#/home" };
  globalThis.Audio = function () { return { play: () => Promise.resolve(), load() {} }; };
  globalThis.SpeechSynthesisUtterance = function () {};
  globalThis.URL = { createObjectURL: () => "x", revokeObjectURL() {} };
  globalThis.Blob = function () {};
  globalThis.navigator = {};
  ["data/kana.js", "data/vocab-n5.js", "data/vocab-n4.js", "data/vocab-n3.js", "data/vocab-n2.js",
    "data/vocab-n1.js", "data/vocab-zjc.js", "data/verbs.js", "data/grammar.js", "data/reading.js",
    "data/textbook.js", "data/audio-map.js", "app.js"].forEach((f) => eval(fs.readFileSync(path.join(ROOT, "js/" + f), "utf8")));
  const J = globalThis.__JP__;
  const S = J.state();
  const routes = [...idxHtml.matchAll(/<a href="#\/([a-z0-9]+)"/g)].map((m) => m[1]);

  function smoke(label) {
    routes.forEach((r) => {
      try {
        globalThis.location.hash = "#/" + r;
        J.render();
        const h = els["#app"].innerHTML || "";
        if (!h.length) bad("[" + label + "] #/" + r + " 渲染为空");
        else if (h.indexOf("<h2") < 0) warn("[" + label + "] #/" + r + " 没有 h2 标题");
        else ok("[" + label + "] #/" + r + " 正常（" + h.length + " 字符）");
      } catch (e) {
        bad("[" + label + "] #/" + r + " 抛异常：" + e.message);
      }
    });
  }

  smoke("空数据");

  // 造数据：学过的词 + 错词 + 自定义词
  const now = Date.now();
  J.VOCAB.N5.slice(0, 40).forEach((v, i) => {
    S.cards[v.id] = i < 8
      ? { i: 1, ef: 2.5, n: 1, due: now - 3600000, ph: "l", st: -1, lp: 1 }
      : { i: 6, ef: 2.5, n: 6, due: now - 3600000, ph: "r", st: 1, lp: 0 };
  });
  S.wrong = J.VOCAB.N5.slice(10, 14).map((v) => v.id);
  console.log("");
  smoke("有数据");

  // 极端：所有词都学过
  console.log("");
  ["N5", "N4", "N3", "N2", "N1"].forEach((L) => J.VOCAB[L].forEach((v) => {
    S.cards[v.id] = { i: 6, ef: 2.5, n: 6, due: now + 86400000, ph: "r", st: 1, lp: 0 };
  }));
  ok("已注入 " + Object.keys(S.cards).length + " 个已学词，测试满量渲染");
  smoke("全量已学");

  // 已学词页在满量下不能卡死（简单计时）
  const t0 = Date.now();
  globalThis.location.hash = "#/studied";
  J.render();
  const dt = Date.now() - t0;
  if (dt > 3000) bad("#/studied 满量渲染耗时 " + dt + "ms（偏慢）");
  else ok("#/studied 满量渲染 " + dt + "ms");

  /* ---- 逐篇渲染所有精读文章的三种阶段 ----
   * 为什么单列一节：上面只冒烟渲染了「文章列表」，而**文章正文**是另一条渲染路径。
   * 一篇里混进一个坏字符（如全角引号「“再见！”」、undefined 的假名）只会让
   * 这一篇炸掉，列表页完全看不出来。逐篇 × 逐阶段渲染才能兜住。 */
  console.log("");
  const RD = globalThis.READING || [];
  const stages = ["read", "blank", "quiz"];
  let rdBad = 0, rdOk = 0;
  const fire = (attr, val) => {
    if (!clickHandler) return false;
    const target = {
      id: "", closest: () => null,
      getAttribute: (n) => (n === attr ? val : null)
    };
    clickHandler({ target: target });
    return true;
  };
  if (!clickHandler) bad("没捕获到 click 处理器，逐篇渲染无法进行");
  else {
    RD.forEach((a) => {
      if (!fire("data-rdopen", a.id)) return;
      stages.forEach((st) => {
        try {
          fire("data-rdstage", st);
          const h = els["#app"].innerHTML || "";
          if (h.indexOf("undefined") >= 0) { bad(a.id + " 阶段 " + st + " 渲染出 undefined"); rdBad++; return; }
          if (h.indexOf("NaN") >= 0) { bad(a.id + " 阶段 " + st + " 渲染出 NaN"); rdBad++; return; }
          if (h.length < 200) { bad(a.id + " 阶段 " + st + " 内容过短（" + h.length + " 字符）"); rdBad++; return; }
          rdOk++;
        } catch (e) {
          bad(a.id + " 阶段 " + st + " 抛异常：" + e.message);
          rdBad++;
        }
      });
      fire("data-rdback", "1");
    });
    if (!rdBad) ok("精读 " + RD.length + " 篇 × " + stages.length + " 阶段全部渲染正常（" + rdOk + " 次）");
  }
}

/* ============ 6. CSS 响应式与新增类的覆盖 ============ */
console.log("\n[6] 样式：媒体查询覆盖与潜在溢出");
{
  const mq = css.match(/@media\(max-width:640px\)\{([\s\S]*?)\n\}/g) || [];
  ok("有 " + mq.length + " 个 @media(max-width:640px) 块");
  const mqAll = mq.join("\n");
  // 新增的类是否在窄屏有处理
  const newish = ["svrow", "svword", "svsay", "ctxbox", "ctxj", "gtime", "rsay"];
  newish.forEach((c) => {
    if (css.indexOf("." + c) < 0) bad("样式里找不到 ." + c);
  });
  const sized = ["svrow", "svword", "svsay", "rsay", "cfront", "qtitle"];
  const unhandled = sized.filter((c) => mqAll.indexOf("." + c) < 0);
  if (unhandled.length) warn("窄屏未单独调整字号/尺寸（若用了固定大字号需确认）：" + unhandled.join(", "));
  else ok("窄屏对关键元素都有单独调整");

  // flex 容器是否有换行，防溢出
  ["nav", "chips", "svbar", "rowbox", "svmeta"].forEach((c) => {
    const block = css.match(new RegExp("\\." + c + "\\{[^}]*\\}"));
    if (!block) { warn("找不到 ." + c + " 定义"); return; }
    if (block[0].indexOf("flex") < 0) return;                 // 不是 flex 就不管
    if (block[0].indexOf("flex-wrap") < 0 && c !== "rowbox" && c !== "svmeta") {
      warn("." + c + " 是 flex 但没有 flex-wrap，长内容可能溢出");
    }
  });
  ok("flex 换行检查完成");

  // 可能撑破容器的长文本
  // ⚠️ 必须把「合并选择器」算进来：换行保护常写成
  //    .ctxj,.ctxz,.rj,...{overflow-wrap:break-word}
  //    如果只按 "\.<类>\{[^}]*\}" 找单条规则，会把已受保护的类误报成「未见保护」。
  //    这里先把所有带换行声明的规则拆开，收进一个集合，再逐类判断。
  const wrapped = new Set();
  // 先剥掉 /* 注释 */ —— 否则紧挨规则前面的注释会粘在第一个选择器上，
  // 导致该选择器匹配不上（表现为"合并选择器里的第一个类被误报"）。
  const cssNoComment = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let rm;
  while ((rm = ruleRe.exec(cssNoComment))) {
    const decls = rm[2];
    if (decls.indexOf("overflow-wrap") < 0 && decls.indexOf("word-break") < 0) continue;
    rm[1].split(",").forEach((sel) => {
      const cm = sel.trim().match(/^\.([A-Za-z0-9_-]+)$/);
      if (cm) wrapped.add(cm[1]);
    });
  }
  const longTextRisk = ["ctxj", "gname", "svword", "rj", "rblank"];
  longTextRisk.forEach((c) => {
    const block = css.match(new RegExp("\\." + c + "\\{[^}]*\\}"));
    if (!block) { warn("样式里找不到 ." + c); return; }
    if (wrapped.has(c)) return;                                  // 已在合并选择器里受保护
    if (block[0].indexOf("word-break") < 0 && block[0].indexOf("overflow-wrap") < 0
      && block[0].indexOf("min-width:0") < 0 && block[0].indexOf("flex:1") < 0
      && block[0].indexOf("white-space:nowrap") < 0) {
      warn("." + c + " 未见换行保护（长句子可能横向溢出）：" + block[0].replace(/\s+/g, " ").slice(0, 70));
    }
  });
  ok("长文本换行检查完成（合并选择器已纳入判定）");
}

console.log("\n" + (problems ? "✗" : "✓") + " 自检结束：" + problems + " 个问题 / " + notes + " 个提示");
process.exitCode = problems ? 1 : 0;
