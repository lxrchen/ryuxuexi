/*
 * 真人发音探测脚本
 * 扫描全部词表（N5-N1 + 动词/形容词），查询 JapanesePod101 日语真人发音库，
 * 把「有真人音频」的词写入 js/data/audio-map.js，供前端优先播放。
 *
 * 用法： node tools/probe-audio.js
 * 输出： js/data/audio-map.js  （globalThis.AUDIO_MAP）
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "js", "data");
const OUT = path.join(DATA, "audio-map.js");

// 未命中时服务端返回的占位音频特征（md5 前 12 位 / 固定体积）
const PLACE_MD5 = "7e2c2f954ef6";
const PLACE_LEN = 52288;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36";

function loadGlobal(file, name) {
  const src = fs.readFileSync(path.join(DATA, file), "utf8");
  const g = {};
  const fn = new Function("globalThis", src + "\n;return globalThis." + name + ";");
  return fn(globalThis);
}

/* 收集全部词条：[{key:"漢字|かな", kanji, kana, isVerb}] */
function collect() {
  const out = [];
  const LV = [["vocab-n5.js", "VOCAB_N5"], ["vocab-n4.js", "VOCAB_N4"], ["vocab-n3.js", "VOCAB_N3"], ["vocab-n2.js", "VOCAB_N2"], ["vocab-n1.js", "VOCAB_N1"]];
  for (const [f, n] of LV) {
    let arr = [];
    try { arr = loadGlobal(f, n) || []; } catch (e) { console.log("跳过", f, e.message); continue; }
    for (const it of arr) {
      const kana = Array.isArray(it) ? it[1] : it.k;
      const kanji = (Array.isArray(it) ? it[2] : it.w) || kana;
      if (!kana) continue;
      out.push({ key: kanji + "|" + kana, kanji: kanji, kana: kana });
    }
  }
  // 动词 / 形容词也收录（用于变形训练页发音）
  try {
    const verbs = loadGlobal("verbs.js", "VERBS") || [];
    for (const v of verbs) {
      const kana = v[0], kanji = v[1] || v[0];
      if (kana) out.push({ key: kanji + "|" + kana, kanji: kanji, kana: kana });
    }
  } catch (e) {}
  try {
    const adjs = loadGlobal("verbs.js", "ADJS") || [];
    for (const a of adjs) {
      const kana = a[0], kanji = a[1] || a[0];
      if (kana) out.push({ key: kanji + "|" + kana, kanji: kanji, kana: kana });
    }
  } catch (e) {}
  // 去重
  const seen = new Set();
  return out.filter(w => (seen.has(w.key) ? false : (seen.add(w.key), true)));
}

/* ます形 → 基本形 反查表（基于 verbs.js） */
function buildMasuMap() {
  const m = new Map();
  try {
    const verbs = loadGlobal("verbs.js", "VERBS") || [];
    for (const v of verbs) {
      const dict = v[0], type = v[2];
      let masu = null;
      if (type === 2) masu = dict.slice(0, -1) + "ます";
      else if (type === 3) masu = dict === "くる" ? "きます" : dict === "する" ? "します" : dict.replace(/する$/, "します");
      else {
        const tbl = { "う": "い", "く": "き", "ぐ": "ぎ", "す": "し", "つ": "ち", "ぬ": "に", "ぶ": "び", "む": "み", "る": "り" };
        const last = dict.slice(-1);
        if (tbl[last]) masu = dict.slice(0, -1) + tbl[last] + "ます";
      }
      if (masu) m.set(masu, { dict: dict, kanji: v[1] || dict });
    }
  } catch (e) {}
  return m;
}

// 注意：该接口会 301 跳转，必须用 fetch（自动跟随重定向），https.get 不会跟随
async function fetchBuf(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "audio/mpeg,*/*" }, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status !== 200) continue;
      const b = Buffer.from(await res.arrayBuffer());
      if (b.length) return b;
    } catch (e) { await new Promise(r => setTimeout(r, 400)); }
  }
  return null;
}

const md5_12 = (b) => require("crypto").createHash("md5").update(b).digest("hex").slice(0, 12);

function urlOf(kanji, kana, kanaOnly) {
  const base = "https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?";
  if (kanaOnly) return base + "kana=" + encodeURIComponent(kana);
  return base + "kanji=" + encodeURIComponent(kanji) + "&kana=" + encodeURIComponent(kana);
}

async function probe(w) {
  const tries = [];
  tries.push({ kanji: w.kanji, kana: w.kana, kanaOnly: false });
  tries.push({ kanji: w.kanji, kana: w.kana, kanaOnly: true });
  // ます形 → 基本形 再试
  const mm = global.__MASU__ && global.__MASU__.get(w.kana);
  if (mm) {
    tries.push({ kanji: mm.kanji, kana: mm.dict, kanaOnly: false });
    tries.push({ kanji: mm.kanji, kana: mm.dict, kanaOnly: true });
  }
  for (const t of tries) {
    const buf = await fetchBuf(urlOf(t.kanji, t.kana, t.kanaOnly));
    if (!buf || buf.length < 1000) continue;
    if (buf.length === PLACE_LEN && md5_12(buf) === PLACE_MD5) continue;
    return t.kanji + "|" + t.kana; // 命中
  }
  return null;
}

(async () => {
  global.__MASU__ = buildMasuMap();
  const words = collect();
  console.log("待探测词条:", words.length, "| ます形映射:", global.__MASU__.size);

  const map = {};
  let done = 0, hit = 0, emptyStreak = 0;
  const CONC = 5;
  let idx = 0;
  await new Promise((resolve) => {
    const worker = async () => {
      while (idx < words.length) {
        const i = idx++;
        const w = words[i];
        const r = await probe(w);
        if (r) { map[w.key] = (r === w.key ? 1 : r); hit++; }
        done++;
        if (done % 100 === 0) {
          console.log(`  进度 ${done}/${words.length}  命中 ${hit} (${Math.round(hit / done * 100)}%)`);
          if (hit / done < 0.05 && done > 300) { console.log("命中率过低，疑似被限流，提前中止"); idx = words.length; break; }
        }
      }
      if (--CONC_LEFT === 0) resolve();
    };
    let CONC_LEFT = CONC;
    for (let i = 0; i < CONC; i++) worker();
  });

  const body = "globalThis.AUDIO_MAP = " + JSON.stringify(map) + ";";
  fs.writeFileSync(OUT, body, "utf8");
  console.log("\n完成：命中", hit, "/", words.length, "=", Math.round(hit / words.length * 100) + "%");
  console.log("已写入", OUT, "(", (Buffer.byteLength(body) / 1024).toFixed(1), "KB )");
})();
