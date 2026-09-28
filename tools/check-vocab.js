// 词表 / 语法表数据自检
// 用法: node tools/check-vocab.js
// 检查项：① 缺字段 ② 词性取值合法 ③ 假名含非法字符 ④ 同等级内重复（假名+汉字）
//        ⑤ 动词是否统一用ます形 ⑥ 动词变形抽查
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DIR = path.join(__dirname, "..", "js", "data");
const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
["vocab-n5", "vocab-n4", "vocab-n3", "vocab-n2", "vocab-n1", "grammar", "verbs"].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(DIR, f + ".js"), "utf8"), ctx);
});

const POS = ["名", "动1", "动2", "动3", "形1", "形2", "副", "连体", "叹", "助", "接", "代"];
let bad = 0;
const dupsSameLv = [];
const say = (m) => { console.log(m); bad++; };

// N5 是数组格式 [课号, 假名, 汉字, 中文, 词性]，统一成对象便于检查
function norm(lv, arr) {
  if (lv === "N5") {
    return arr.map(function (x, i) {
      return { _i: i, l: x[0], k: x[1], w: x[2], z: x[3], p: x[4] };
    });
  }
  return arr.map(function (x, i) { return Object.assign({ _i: i }, x); });
}

const LEVELS = [
  ["N5", ctx.VOCAB_N5],
  ["N4", ctx.VOCAB_N4],
  ["N3", ctx.VOCAB_N3],
  ["N2", ctx.VOCAB_N2],
  ["N1", ctx.VOCAB_N1]
];

console.log("=== 词条字段 / 词性 / 假名检查 ===");
for (const [lv, raw] of LEVELS) {
  const list = norm(lv, raw);
  const seen = new Map();
  let verbBad = 0;
  for (const v of list) {
    if (!v.k || typeof v.k !== "string") say(lv + " #" + v._i + " 假名为空：" + JSON.stringify(v));
    if (v.z === undefined || v.z === null || v.z === "") say(lv + " #" + v._i + " 中文释义为空：" + v.k);
    if (v.w === undefined || v.w === null) say(lv + " #" + v._i + " 汉字表记未定义（应为空串）：" + v.k);
    if (!POS.includes(v.p)) say(lv + " #" + v._i + " 词性非法 " + v.p + "：" + v.k);
    // 假名只允许 平假名 / 片假名 / 长音符 / 小写ゃゅょっ 等
    if (v.k && !/^[぀-ゟ゠-ヿー々]+$/.test(v.k)) say(lv + " #" + v._i + " 假名含非法字符：" + v.k);
    // 动词必须用ます形；N5 第 21-23 课刻意收录了「た形 / 基本形 / たり形」示例条目，属例外
    const isConjSample = lv === "N5" && v.l >= 21 && v.l <= 23;
    if (v.p && v.p.indexOf("动") === 0 && !/ます$/.test(v.k) && !isConjSample) {
      verbBad++;
      if (verbBad <= 5) say(lv + " #" + v._i + " 动词非ます形：" + v.k + " / " + v.w);
    }
    const key = v.k + "|" + (v.w || "");
    if (seen.has(key)) {
      // 同等级 + 同假名 + 同汉字：若课次/主题不同，属于「跨课重现」（教材词表正常），
      // 对 N3-N1 的自建主题表来说则是应当清理的重复，单独列出。
      if (lv === "N5" || lv === "N4") {
        dupsSameLv.push(lv + " 跨课重现：" + key + "（#" + seen.get(key) + " 课" + list[seen.get(key)].l + " 与 #" + v._i + " 课" + v.l + "）");
      } else {
        say(lv + " 重复条目：" + key + "（主题" + list[seen.get(key)].l + " #" + seen.get(key) + " 与 主题" + v.l + " #" + v._i + "）");
      }
    } else seen.set(key, v._i);
  }
  if (verbBad > 5) console.log(lv + " 非ます形动词共 " + verbBad + " 条");
  console.log(lv + "  " + list.length + " 条，检查完毕");
}

console.log("\n=== 语法条目检查 ===");
const G = ctx.GRAMMAR || [];
const gseen = new Map();
G.forEach(function (g, i) {
  if (g.length !== 7) say("语法 #" + i + " 字段数不是 7：" + JSON.stringify(g));
  if (!["N5", "N4", "N3", "N2", "N1"].includes(g[0])) say("语法 #" + i + " 等级非法：" + g[0]);
  if (typeof g[1] !== "number") say("语法 #" + i + " 第 2 列（课号/主题号）不是数字：" + JSON.stringify(g));
  [0, 2, 3, 4, 5, 6].forEach(function (c) {
    if (typeof g[c] !== "string" || !g[c]) say("语法 #" + i + " 第 " + (c + 1) + " 列为空：" + JSON.stringify(g));
  });
  const key = g[0] + "|" + g[2];
  if (gseen.has(key)) say("语法重复：" + key + "（#" + gseen.get(key) + " 与 #" + i + "）");
  else gseen.set(key, i);
});
console.log("语法共 " + G.length + " 条，检查完毕");

console.log("\n=== N5/N4 跨课重现（教材词表正常现象，仅供参考）===");
console.log("共 " + dupsSameLv.length + " 处" + (dupsSameLv.length ? "，例如：" : ""));
dupsSameLv.slice(0, 5).forEach(function (m) { console.log("  " + m); });

console.log("\n=== 动词变形抽查 ===");
// 直接复用 app.js 的 conj 不方便（依赖浏览器 API），这里用独立的最小实现再算一遍
/* 直接抽取 js/app.js 里的变形引擎本体来跑，不另写一份实现。
   为什么：另写一份就等于在测「我重新写的那个函数」，而不是线上真正跑的那个；
   ある→ない 这种特例只存在于 app.js 里，重新实现必然测不到。 */
function loadAppConj() {
  const src = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8").split("\n");
  const from = src.findIndex(function (l) { return /const U\s*=\s*\["う"/.test(l); });
  const to = src.findIndex(function (l) { return /function conjAdj/.test(l); });
  if (from < 0 || to < 0) throw new Error("未能定位 app.js 中的变形引擎（U 常量表 / conjAdj）");
  const box = {};
  new Function(src.slice(from, to).join("\n") + "\nthis.conj = conj;").call(box);
  return box.conj;
}
const conj = loadAppConj();

const CASES = [
  ["いく", 1, "いって", "いかない"],
  ["ある", 1, "あって", "ない"],
  ["くる", 3, "きて", "こない"],
  ["べんきょうする", 3, "べんきょうして", "べんきょうしない"],
  ["たべる", 2, "たべて", "たべない"],
  ["およぐ", 1, "およいで", "およがない"],
  ["よむ", 1, "よんで", "よまない"],
  ["まつ", 1, "まって", "またない"],
  ["かう", 1, "かって", "かわない"],
  ["はなす", 1, "はなして", "はなさない"],
  ["しぬ", 1, "しんで", "しなない"],
  ["あそぶ", 1, "あそんで", "あそばない"]
];
for (const [k, t, te, nai] of CASES) {
  const r = { te: conj(k, t, "te"), nai: conj(k, t, "nai") };
  const ok = r.te === te && r.nai === nai;
  console.log((ok ? "OK  " : "FAIL") + "  " + k + " → て形 " + r.te + "（期望 " + te + "）／ない形 " + r.nai + "（期望 " + nai + "）");
  if (!ok) bad++;
}

console.log("\n" + (bad ? "共 " + bad + " 处问题" : "全部通过 ✓"));
process.exit(bad ? 1 : 0);
