/* ================= 日语学习站 · 核心引擎 ================= */
(function () {
  "use strict";

  /* ---------- 1. 数据归一化 ---------- */
  function normVocab(arr, lv) {
    if (!arr) return [];
    return arr.map(function (v, i) {
      return Array.isArray(v)
        ? { id: lv + "-" + i, lv: lv, l: v[0], k: v[1], w: v[2], z: v[3], p: v[4] }
        : { id: lv + "-" + i, lv: lv, l: v.l, k: v.k, w: v.w, z: v.z, p: v.p };
    });
  }
  const LEVELS = ["N5", "N4", "N3", "N2", "N1"];
  // 内置基础数据（不可变）
  const VOCAB_BASE = {
    N5: normVocab(globalThis.VOCAB_N5, "N5"),
    N4: normVocab(globalThis.VOCAB_N4, "N4"),
    N3: normVocab(globalThis.VOCAB_N3, "N3"),
    N2: normVocab(globalThis.VOCAB_N2, "N2"),
    N1: normVocab(globalThis.VOCAB_N1, "N1")
  };
  const VERBS_BASE = (globalThis.VERBS || []).map(function (v, i) {
    return { id: "v" + i, k: v[0], w: v[1], t: v[2], z: v[3], lv: v[4] };
  });
  const ADJS = (globalThis.ADJS || []).map(function (a, i) {
    return { id: "a" + i, k: a[0], w: a[1], t: a[2], z: a[3], lv: a[4] };
  });
  const FORMS = globalThis.FORMS || [];
  const GRAMMAR_BASE = (globalThis.GRAMMAR || []).map(function (g, i) {
    return { id: "g" + i, lv: g[0], l: g[1], n: g[2], f: g[3], m: g[4], e: g[5], t: g[6] };
  });
  // 运行时视图 = 内置 + 用户自定义词库，由 rebuildAll() 重建
  let VOCAB = {};
  let VERBS = [];
  let GRAMMAR = [];
  const KANA = globalThis.KANA || [];
  const CONFUSE = globalThis.KANA_CONFUSE || [];
  const ROWS = globalThis.KANA_ROWS || [];
  const READING = globalThis.READING || [];

  /* ---------- 2. 状态持久化 ---------- */
  const KEY = "jp_studio_v1";
  const DEF = {
    settings: { goal: "N1", newPerDay: 20, kanaScript: "both", audioMode: "auto", voiceURI: "", ttsRate: 0.9, humanRate: 1 },
    cards: {},        // 单词 SRS: id -> {i,ef,n,due}
    kanaStat: {},     // 假名统计: kana -> {r,w}
    grammar: {},      // 已掌握语法 id -> 1
    drill: { r: 0, w: 0, log: [] },
    checkin: { days: [], streak: 0, last: "" },
    today: { date: "", new: 0, rev: 0, drill: 0, min: 0 },
    act: {},           // 日期 -> 活动量（热力图）
    xp: 0,             // 经验值
    combo: 0,          // 当前连击
    best: 0,           // 最高连击
    wrong: [],         // 错词本（单词 id 列表）
    badges: {},        // 成就
    custom: { vocab: [], grammar: [] },  // 用户自定义词库 / 语法
    reading: {}        // 文章精读进度: id -> { blank:{r,w}, quiz:{r,w}, at }
  };
  let S = (function () {
    try { const r = JSON.parse(localStorage.getItem(KEY)); if (r) return Object.assign({}, DEF, r); }
    catch (e) {}
    return JSON.parse(JSON.stringify(DEF));
  })();
  // 兼容旧存档：补齐新字段，并切断与 DEF 的引用共享（否则清空进度后自定义词会被污染残留）
  S.settings = Object.assign(JSON.parse(JSON.stringify(DEF.settings)), S.settings || {});
  S.custom = (S.custom && S.custom.vocab && S.custom.grammar)
    ? { vocab: S.custom.vocab.slice(), grammar: S.custom.grammar.slice() }
    : { vocab: [], grammar: [] };
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  /* ---------- 2b. 自定义词库合并 ---------- */
  // ます形 → 基本形 反查（优先用内置动词表，再用规则兜底）
  let MASU2DICT = null;
  function masuToDict(masu) {
    if (!/ます$/.test(masu)) return masu;
    if (!MASU2DICT) {
      MASU2DICT = {};
      VERBS_BASE.forEach(function (v) {
        const m = conj(v.k, v.t, "masu");
        if (m) MASU2DICT[m] = v.k;
      });
    }
    if (MASU2DICT[masu]) return MASU2DICT[masu];
    // 规则兜底：去「ます」，い段结尾按五段还原，否则按二类 +る
    const stem = masu.slice(0, -2);
    const last = stem.slice(-1);
    const back = { "い": "う", "き": "く", "ぎ": "ぐ", "し": "す", "ち": "つ", "に": "ぬ", "び": "ぶ", "み": "む", "り": "る" };
    if (back[last]) return stem.slice(0, -1) + back[last];
    return stem + "る";
  }
  function customVocab() { return (S.custom && S.custom.vocab) || []; }
  function customGrammar() { return (S.custom && S.custom.grammar) || []; }
  function rebuildAll() {
    VMAP = null;
    VOCAB = {};
    LEVELS.forEach(function (L) { VOCAB[L] = VOCAB_BASE[L].slice(); });
    const cv = customVocab();
    cv.forEach(function (c) {
      if (!VOCAB[c.lv]) VOCAB[c.lv] = [];
      VOCAB[c.lv].push({ id: c.id, lv: c.lv, l: c.l, k: c.k, w: c.w, z: c.z, p: c.p, custom: true });
    });
    GRAMMAR = GRAMMAR_BASE.concat(customGrammar().map(function (g) {
      return { id: g.id, lv: g.lv, l: g.l, n: g.n, f: g.f, m: g.m, e: g.e, t: g.t, custom: true };
    }));
    VERBS = VERBS_BASE.slice();
    cv.forEach(function (c) {
      if (c.p === "动1" || c.p === "动2" || c.p === "动3") {
        const t = c.p === "动1" ? 1 : c.p === "动2" ? 2 : 3;
        VERBS.push({ id: c.id, k: masuToDict(c.k), w: c.w || c.k, t: t, z: c.z, lv: c.lv, custom: true });
      }
    });
  }
  // 新增自定义词条（自动去重：同级别 + 同假名 + 同汉字视为重复）
  function addCustom(kind, item) {
    const arr = kind === "grammar" ? customGrammar() : customVocab();
    const dup = kind === "grammar"
      ? arr.some(function (x) { return x.n === item.n; })
      : arr.some(function (x) { return x.lv === item.lv && x.k === item.k && (x.w || "") === (item.w || ""); });
    if (dup) return { ok: false, msg: "已存在相同的条目，已跳过" };
    item.id = (kind === "grammar" ? "cg" : "cv") + "-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1000);
    S.custom[kind].push(item);
    rebuildAll(); save();
    return { ok: true, msg: "已添加" };
  }
  function today() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function rollDay() {
    const t = today();
    if (S.today.date !== t) { S.today = { date: t, new: 0, rev: 0, drill: 0, min: 0 }; save(); }
  }
  function act(n) { rollDay(); S.act[today()] = (S.act[today()] || 0) + (n || 1); save(); }

  /* ---------- 2b. 反馈：XP / 连击 / 成就 / Toast ---------- */
  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._tm); t._tm = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
  function addXp(n) {
    S.xp += n; save();
    const b = document.querySelector(".xpbar i");
    if (b) { const lv = levelOf(); b.style.width = (S.xp % 500) / 5 + "%"; }
  }
  function levelOf() { return Math.floor(S.xp / 500) + 1; }
  function bumpCombo(ok) {
    if (ok) {
      S.combo++; if (S.combo > S.best) S.best = S.combo;
      if (S.combo === 10) { toast("连击 10！手感来了"); }
      if (S.combo === 30) { toast("连击 30！机器猫附体"); }
    } else S.combo = 0;
    save();
    const c = document.querySelector(".combo");
    if (c) { c.innerHTML = S.combo > 1 ? "连击 <b>" + S.combo + "</b>" : ""; c.classList.toggle("show", S.combo > 1); }
  }
  function pushWrong(id) {
    if (S.wrong.indexOf(id) < 0) { S.wrong.push(id); if (S.wrong.length > 400) S.wrong = S.wrong.slice(-400); save(); }
  }
  function popWrong(id) {
    const i = S.wrong.indexOf(id); if (i >= 0) { S.wrong.splice(i, 1); save(); }
  }
  const BADGES = [
    ["first", "初次见面", function () { return Object.keys(S.cards).length >= 1; }],
    ["w100", "百词斩", function () { return Object.keys(S.cards).length >= 100; }],
    ["w500", "五百词", function () { return Object.keys(S.cards).length >= 500; }],
    ["kana", "五十音达成", function () { return Object.keys(S.kanaStat).length >= 46; }],
    ["drill", "变形入门", function () { return S.drill.r >= 50; }],
    ["drill2", "变形大师", function () { return S.drill.r >= 300; }],
    ["combo", "连击 20", function () { return S.best >= 20; }],
    ["streak", "坚持 7 天", function () { return S.checkin.streak >= 7; }],
    ["grammar", "语法 50", function () { return Object.keys(S.grammar).length >= 50; }]
  ];
  function syncBadges() {
    let got = false;
    BADGES.forEach(function (b) { if (!S.badges[b[0]] && b[2]()) { S.badges[b[0]] = 1; got = true; toast("解锁成就：" + b[1]); } });
    if (got) save();
  }

  /* ---------- 3. SRS（SM-2 简化） ---------- */
  function cardOf(id) {
    return S.cards[id] || (S.cards[id] = { i: 0, ef: 2.5, n: 0, due: 0 });
  }
  function review(id, grade) {
    const c = cardOf(id);
    const q = [0, 3, 4, 5][grade];
    if (q < 3) { c.n = 0; c.i = 0; c.due = Date.now() + 600000; }
    else {
      c.n++;
      c.ef = Math.max(1.3, c.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
      c.i = c.n === 1 ? 1 : c.n === 2 ? 6 : Math.round(c.i * c.ef);
      c.due = Date.now() + c.i * 86400000;
    }
    if (c.n === 1 && grade >= 2) S.today.new++; else S.today.rev++;
    save();
  }
  function dueList(lv) {
    const now = Date.now();
    const out = [];
    LEVELS.forEach(function (L) {
      if (lv && L !== lv) return;
      VOCAB[L].forEach(function (v) {
        const c = S.cards[v.id];
        if (c && c.due && c.due <= now) out.push(v);
      });
    });
    return out;
  }
  function newList(lv, n, lesson) {
    const out = [];
    LEVELS.forEach(function (L) {
      if (lv && L !== lv) return;
      VOCAB[L].forEach(function (v) {
        if (lesson && v.l !== lesson) return;   // 先按课号过滤，再取数量（反过来会导致选课后抽不到词）
        if (!S.cards[v.id]) out.push(v);
      });
    });
    return shuffle(out).slice(0, n);
  }
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ---------- 4. 动词/形容词变形引擎 ---------- */
  const U = ["う", "く", "ぐ", "す", "つ", "ぬ", "ぶ", "む", "る"];
  const I = ["い", "き", "ぎ", "し", "ち", "に", "び", "み", "り"];
  const E = ["え", "け", "げ", "せ", "て", "ね", "べ", "め", "れ"];
  const A = ["わ", "か", "が", "さ", "た", "な", "ば", "ま", "ら"];
  const O = ["お", "こ", "ご", "そ", "と", "の", "ぼ", "も", "ろ"];
  function te1(kana) {
    if (kana === "いく" || kana === "行く") return "いって";
    const last = kana[kana.length - 1], st = kana.slice(0, -1);
    if (last === "く") return st + "いて";
    if (last === "ぐ") return st + "いで";
    if (last === "す") return st + "して";
    if ("つるう".indexOf(last) >= 0) return st + "って";
    if ("ぬぶむ".indexOf(last) >= 0) return st + "んで";
    return st + "って";
  }
  function conj(kana, type, form) {
    if (type === 3) {
      if (kana === "くる" || kana === "来る") {
        const K = { masu: "きます", te: "きて", ta: "きた", nai: "こない", base: "くる", kanou: "こられる", ishi: "こよう", ba: "くれば", ukemi: "こられる", shieki: "こさせる", meirei: "こい" };
        return K[form];
      }
      const st = kana.slice(0, -2), shi = st + "し";
      const M = { masu: shi + "ます", te: shi + "て", ta: shi + "た", nai: shi + "ない", base: kana, kanou: st + "できる", ishi: shi + "よう", ba: shi + "れば", ukemi: st + "される", shieki: st + "させる", meirei: shi + "ろ" };
      return M[form];
    }
    if (type === 2) {
      const st = kana.slice(0, -1);
      const M = { masu: st + "ます", te: st + "て", ta: st + "た", nai: st + "ない", base: kana, kanou: st + "られる", ishi: st + "よう", ba: st + "れば", ukemi: st + "られる", shieki: st + "させる", meirei: st + "ろ" };
      return M[form];
    }
    const last = kana[kana.length - 1], idx = U.indexOf(last), st = kana.slice(0, -1);
    if (idx < 0) return kana;
    const te = te1(kana);
    switch (form) {
      case "masu": return st + I[idx] + "ます";
      case "te": return te;
      case "ta": return te.replace(/て$/, "た").replace(/で$/, "だ");
      case "nai": return kana === "ある" ? "ない" : st + A[idx] + "ない";
      case "base": return kana;
      case "kanou": return st + E[idx] + "る";
      case "ishi": return st + O[idx] + "う";
      case "ba": return st + E[idx] + "ば";
      case "ukemi": return st + A[idx] + "れる";
      case "shieki": return st + A[idx] + "せる";
      case "meirei": return st + E[idx];
    }
    return kana;
  }
  function conjAdj(kana, type, form) {
    const base = kana === "いい" ? "よい" : kana;
    if (type === "形1") {
      const st = base.slice(0, -1); // 高い→高
      switch (form) {
        case "base": return kana;
        case "te": return st + "くて";
        case "ta": return st + "かった";
        case "nai": return st + "くない";
        case "nakatta": return st + "くなかった";
        case "fukushi": return st + "く";
        case "ba": return st + "ければ";
        case "rentai": return kana;
      }
      return kana;
    }
    switch (form) {
      case "base": return kana;
      case "te": return kana + "で";
      case "ta": return kana + "だった";
      case "nai": return kana + "ではない";
      case "nakatta": return kana + "ではなかった";
      case "fukushi": return kana + "に";
      case "ba": return kana + "なら（ば）";
      case "rentai": return kana + "な";
    }
    return kana;
  }
  const ADJ_FORMS = [
    ["base", "基本形"], ["te", "て形(并列)"], ["ta", "た形(过去)"], ["nai", "ない形(否定)"],
    ["nakatta", "过去否定"], ["fukushi", "副词化"], ["ba", "ば形"], ["rentai", "连体形"]
  ];

  /* ---------- 5. 语音：真人音源优先 + 智能 TTS 选音 ---------- */
  let AUDIO_EL = null;                 // 真人发音播放器（复用）
  let TTS_VOICES = [];                // 设备可用日语语音
  let VOICE_BOUND = false;

  function loadVoices() {
    if (!window.speechSynthesis) return;
    const vs = window.speechSynthesis.getVoices() || [];
    TTS_VOICES = vs.filter(function (v) { return /^ja/i.test(v.lang || "") || /日本|Japanese/i.test(v.name || ""); });
  }
  function bindVoices() {
    if (VOICE_BOUND || !window.speechSynthesis) return;
    VOICE_BOUND = true;
    loadVoices();
    window.speechSynthesis.onvoiceschanged = function () { loadVoices(); };
    // Chrome 首次可能为空，延迟再取一次
    setTimeout(loadVoices, 300); setTimeout(loadVoices, 1200);
  }
  // 语音质量打分：Google 日本語(Chrome云端神经) > Win11 神经语音(Aoi/Naoki/Shiori) > 老 SAPI(Ayumi/Ichiro) > 其他
  function scoreVoice(v) {
    const n = (v.name || "") + " " + (v.voiceURI || "");
    let s = 0;
    if (/Google\s*日本語|Google\s*Japanese/i.test(n)) s += 100;
    if (/Aoi|Naoki|Shiori|Keita|Chihiro|Nanami/i.test(n)) s += 80;
    if (/Natural|Neural|Online|Cloud/i.test(n)) s += 30;
    if (/Ayumi|Haruka|Ichiro|Sayaka/i.test(n)) s += 20;
    if (v.localService === false) s += 10;
    if (/eSpeak|Pico|compact|robot/i.test(n)) s -= 60;
    return s;
  }
  function voiceList() {
    bindVoices(); if (!TTS_VOICES.length) loadVoices();
    return TTS_VOICES.slice().sort(function (a, b) { return scoreVoice(b) - scoreVoice(a); });
  }
  function bestVoice() {
    const list = voiceList();
    if (!list.length) return null;
    const want = S.settings.voiceURI;
    if (want) {
      for (let i = 0; i < list.length; i++) {
        if (list[i].voiceURI === want || list[i].name === want) return list[i];
      }
    }
    return list[0];
  }
  function ttsUrl(kanji, kana, kanaOnly) {
    const base = "https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?";
    if (kanaOnly || !kanji) return base + "kana=" + encodeURIComponent(kana);
    return base + "kanji=" + encodeURIComponent(kanji) + "&kana=" + encodeURIComponent(kana);
  }
  // 依据 AUDIO_MAP 生成候选真人音频地址（按可靠性排序）
  function humanCandidates(kanji, kana) {
    const M = globalThis.AUDIO_MAP;
    const out = [];
    if (!kana) return out;
    if (!M) { out.push(ttsUrl(kanji, kana, false)); return out; }   // 未加载映射表时盲试一次
    const key = (kanji || kana) + "|" + kana;
    const m = M[key];
    if (m === 1) { out.push(ttsUrl(kanji, kana, false)); }
    else if (m === 2) { out.push(ttsUrl(null, kana, true)); }
    else if (typeof m === "string") {
      const p = m.split("|");
      if (p[0]) out.push(ttsUrl(p[0], p[1], false));
      out.push(ttsUrl(null, p[1], true));
    } else { return out; }   // 明确无真人音
    // 兜底候选
    if (kanji) out.push(ttsUrl(null, kana, true));
    return out;
  }
  function hasHuman(kanji, kana) {
    const M = globalThis.AUDIO_MAP;
    if (!M || !kana) return false;
    return !!M[(kanji || kana) + "|" + kana];
  }
  /* 音频缓存：Service Worker 会拦截 <audio> 请求并落缓存（跨域资源无 CORS，只能走 SW，
     页面端 fetch 会失败）。这里只负责「查询是否已缓存」「主动预热」「统计/清空」。 */
  const ACACHE = "jp-audio-v1";
  const HUMAN_HOST = "languagepod101.com";
  let cacheSupported = typeof caches !== "undefined";
  function acache() { return cacheSupported ? caches.open(ACACHE) : Promise.reject(new Error("no cache api")); }
  function isCached(url) {
    if (!cacheSupported) return Promise.resolve(false);
    return acache().then(function (c) { return c.match(url); }).then(function (m) { return !!m; }).catch(function () { return false; });
  }
  function warmAudio(url) {
    if (!cacheSupported || !url) return Promise.resolve(false);
    return acache().then(function (c) {
      return c.match(url).then(function (m) {
        if (m) return false;
        // no-cors 模式可缓存跨域 opaque 响应（无需 CORS 头）
        return c.add(new Request(url, { mode: "no-cors" })).then(function () { return true; }).catch(function () { return false; });
      });
    }).catch(function () { return false; });
  }
  function cachedCount() {
    if (!cacheSupported) return Promise.resolve(0);
    return acache().then(function (c) { return c.keys(); }).then(function (ks) { return ks.length; }).catch(function () { return 0; });
  }
  function clearAudioCache() {
    if (!cacheSupported) return Promise.resolve(0);
    return acache().then(function (c) {
      return c.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return c.delete(k); })).then(function () { return ks.length; }); });
    }).catch(function () { return 0; });
  }
  // 按等级批量预热真人音（后台跑，带并发控制）
  let warmState = { running: false, done: 0, total: 0, ok: 0 };
  function warmLevel(lv, onProgress) {
    if (warmState.running) return Promise.resolve(warmState);
    const M = globalThis.AUDIO_MAP || {};
    const list = (VOCAB[lv] || []).filter(function (v) { return M[(v.w || v.k) + "|" + v.k]; });
    const urls = [];
    const seen = {};
    list.forEach(function (v) {
      const c = humanCandidates(v.w, v.k);
      if (c.length && !seen[c[0]]) { seen[c[0]] = 1; urls.push(c[0]); }
    });
    warmState = { running: true, done: 0, total: urls.length, ok: 0 };
    let i = 0;
    return new Promise(function (resolve) {
      const CONC = 5;
      let left = CONC;
      const step = function () {
        if (i >= urls.length) {
          if (--left === 0) { warmState.running = false; resolve(warmState); }
          return;
        }
        const u = urls[i++];
        warmAudio(u).then(function (ok) {
          warmState.done++; if (ok) warmState.ok++;
          if (onProgress && warmState.done % 20 === 0) onProgress(warmState);
          step();
        });
      };
      for (let k = 0; k < CONC; k++) step();
      if (!urls.length) { warmState.running = false; resolve(warmState); }
    });
  }

  /* 播放真人音：候选依次尝试，全程只回落一次，杜绝与 TTS 重叠串台 */
  function playHuman(cands, fallback, txt) {
    if (!cands || !cands.length) { fallback(); return; }
    const url = cands.shift();
    let a;
    try { a = AUDIO_EL || (AUDIO_EL = new Audio()); } catch (e) { fallback(); return; }
    let settled = false;              // 是否已出声（真人音 or 兜底 TTS）
    let timer = null;
    const clear = function () { if (timer) { clearTimeout(timer); timer = null; } };
    const fallbackOnce = function () {
      if (settled) return;
      settled = true; clear();
      if (cands.length) playHuman(cands, fallback, txt); else fallback();
    };
    // 未缓存且允许兜底时，2.5 秒还没出声就先用 TTS（音频继续后台加载，下次即命中缓存）
    if (txt && (S.settings.audioMode || "auto") === "auto") {
      isCached(url).then(function (hit) {
        if (!hit && !settled) {
          timer = setTimeout(function () { if (settled) return; settled = true; tts(txt); }, 2500);
        }
      });
    }
    a.oncanplay = function () { clear(); settled = true; };
    a.onended = function () { a.onended = null; };
    a.onerror = function () { clear(); fallbackOnce(); };
    a.onstalled = function () { clear(); fallbackOnce(); };
    a.playbackRate = S.settings.humanRate || 1;
    a.src = url;
    try { a.load(); } catch (e) {}
    const p = a.play();
    // 注意：play() 的 reject（自动播放拦截等）不能再触发 fallback，否则会与 TTS 重叠
    if (p && p.catch) p.catch(function () {});
  }
  function tts(txt) {
    try {
      if (!window.speechSynthesis || !txt) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(txt);
      u.lang = "ja-JP";
      u.rate = S.settings.ttsRate || 0.9;
      const v = bestVoice();
      if (!v) {
        // 关键：没有日语语音就绝不朗读，否则系统会用中文语音念日语 —— 这就是「串台」
        if (!NO_JA_WARNED) {
          NO_JA_WARNED = true;
          toast("未检测到日语语音，已跳过朗读（避免中文腔）。Windows：设置→时间和语言→语言和区域→添加「日本語」→语言选项→勾选「语音」");
        }
        return;
      }
      u.voice = v;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
  let NO_JA_WARNED = false;
  /* speak(txt, opt) —— opt: { kanji, kana } 提供时优先播真人发音 */
  function speak(txt, opt) {
    opt = opt || {};
    const mode = S.settings.audioMode || "auto";
    if (mode !== "tts" && opt.kana) {
      const c = humanCandidates(opt.kanji, opt.kana);
      if (c.length) {
        playHuman(c, function () {
          if (mode !== "human") tts(txt); else toast("该词暂无真人发音（可切「自动」用 TTS 兜底）");
        }, txt);
        return;
      }
      if (mode === "human") { toast("该词暂无真人发音"); return; }
    }
    tts(txt);
  }
  // 后台预热下一张卡片（刷卡时几乎无感）
  function prefetchNext() {
    if (S.settings.audioMode === "tts") return;
    const v = vs.queue[vs.idx + 1];
    if (!v) return;
    const c = humanCandidates(v.w, v.k);
    if (c.length) warmAudio(c[0]);
  }

  /* ---------- 6. 工具 ---------- */
  const $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }

  /* ---------- 7. 视图：首页 ---------- */
  function viewHome() {
    const due = dueList().length;
    const goalCards = Math.min(S.settings.newPerDay + 30, 60);
    const doneToday = S.today.new + S.today.rev;
    const pctDay = Math.min(100, Math.round(doneToday / goalCards * 100));
    const lvNow = levelOf(), xpIn = S.xp % 500;
    const hero = '<div class="ringwrap">'
      + '<div class="ring" style="--p:' + pctDay + '"><span>' + pctDay + '%</span></div>'
      + '<div class="ringinfo"><div class="t">今日目标　' + doneToday + ' / ' + goalCards + ' 张卡</div>'
      + '<div class="d">每天先清掉到期复习，再学新词 · 当前 Lv.' + lvNow + '　最高连击 ' + S.best + '</div>'
      + '<div class="xpbar"><i style="width:' + (xpIn / 5) + '%"></i></div>'
      + '<div class="xptxt"><span>经验值 ' + S.xp + '</span><span>距 Lv.' + (lvNow + 1) + ' 还差 ' + (500 - xpIn) + '</span></div>'
      + '</div></div>';
    const learnedAll = Object.keys(S.cards).length;
    const totalAll = LEVELS.reduce(function (s, L) { return s + VOCAB[L].length; }, 0);
    const gKnown = Object.keys(S.grammar).length;
    const pct = function (L) {
      const tot = VOCAB[L].length || 1;
      const got = VOCAB[L].filter(function (v) { return S.cards[v.id]; }).length;
      return { p: Math.round(got / tot * 100), got: got, tot: tot };
    };
    let h = hero + '<div class="hero">';
    h += '<h2>今日のミッション</h2><div class="mgrid">';
    h += '<div class="mcard"><div class="mnum">' + Math.max(0, S.settings.newPerDay - S.today.new) + '</div><div class="mlab">今日新词</div><button class="btn" data-go="learn">学新词</button></div>';
    h += '<div class="mcard"><div class="mnum">' + due + '</div><div class="mlab">待复习卡片</div><button class="btn" data-go="review">去复习</button></div>';
    h += '<div class="mcard"><div class="mnum">' + S.drill.r + '</div><div class="mlab">变形正确</div><button class="btn" data-go="drill">变形训练</button></div>';
    h += '</div>';
    h += '<div class="rowbox"><span>目标：<b>' + S.settings.goal + '</b></span>';
    h += '<span>已学词：<b>' + learnedAll + '</b> / ' + totalAll + '</span>';
    h += '<span>语法：<b>' + gKnown + '</b> / ' + GRAMMAR.length + '</span>';
    h += '<span>连续打卡：<b>' + S.checkin.streak + '</b> 天</span></div></div>';

    h += '<h3>各级别掌握度</h3><div class="lvgrid">';
    LEVELS.forEach(function (L) {
      const d = pct(L);
      h += '<div class="lvrow"><div class="lvname">' + L + '</div><div class="bar"><i style="width:' + d.p + '%"></i></div><div class="lvnum">' + d.got + '/' + d.tot + '　' + d.p + '%</div></div>';
    });
    h += '</div>';
    // 未来 7 天到期预测
    const now = Date.now();
    const fcs = [];
    for (let d = 0; d < 7; d++) {
      const end = now + (d + 1) * 86400000, start = now + d * 86400000;
      let n = 0;
      LEVELS.forEach(function (L) {
        VOCAB[L].forEach(function (v) { const c = S.cards[v.id]; if (c && c.due && c.due > start && c.due <= end) n++; });
      });
      fcs.push(n);
    }
    const maxF = Math.max.apply(null, fcs.concat([1]));
    h += '<h3>未来 7 天复习量预测</h3><div class="forecast">';
    fcs.forEach(function (n, i) {
      const dt = new Date(now + i * 86400000);
      h += '<div class="fc"><em>' + n + '</em><i style="height:' + Math.max(3, n / maxF * 66) + 'px"></i><span>' + (i === 0 ? "今天" : (dt.getMonth() + 1) + "/" + dt.getDate()) + '</span></div>';
    });
    h += '</div>';

    // 成就
    h += '<h3>成就</h3><div class="badges">';
    BADGES.forEach(function (b) {
      const got = !!S.badges[b[0]];
      h += '<div class="badge' + (got ? " got" : "") + '"><span class="ic">' + (got ? "★" : "○") + '</span>' + b[1] + '</div>';
    });
    h += '</div>';

    h += '<p class="tip">提示：先把 N5/N4 打满（各 100%），再往上推 N3 → N2 → N1。语法条目可随时在「语法」页按级别查阅并标记掌握。</p>';
    return h;
  }

  /* ---------- 8. 视图：五十音 ---------- */
  let kanaState = { mode: "read", scope: "all" };
  function kanaPool() {
    let pool = KANA;
    if (kanaState.scope !== "all") {
      const r = ROWS.filter(function (x) { return x.name === kanaState.scope; })[0];
      if (r) pool = KANA.filter(function (k) { return r.list.indexOf(k[0]) >= 0; });
      else if (kanaState.scope === "浊拗") pool = KANA.filter(function (k) { return k[6] !== "清"; });
      else if (kanaState.scope === "清音") pool = KANA.filter(function (k) { return k[6] === "清"; });
    }
    return pool;
  }
  let kanaQ = null;
  function nextKana() {
    const pool = kanaPool();
    if (!pool.length) return (kanaQ = null);
    if (kanaState.mode === "confuse") {
      const c = pick(CONFUSE);
      const side = Math.random() < 0.5 ? 0 : 1;
      kanaQ = { kind: "confuse", a: c[0], b: c[1], ans: side, word: c[3 + side], hint: c[2], note: c[5 + side] };
      return;
    }
    const k = pick(pool);
    let q, opts = [];
    if (kanaState.mode === "read") {
      const disp = Math.random() < 0.5 ? k[0] : k[1];
      const set = new Set([k[2]]);
      while (set.size < 4) set.add(pick(pool)[2]);
      opts = shuffle(Array.from(set));
      q = { kind: "read", disp: disp, ans: k[2], opts: opts, src: k[3], ex: k[4], exz: k[5] };
    } else {
      const target = Math.random() < 0.5 ? k[0] : k[1];
      const set = new Set([target]);
      let guard = 0;
      while (set.size < 4 && guard++ < 60) {
        const p = pick(pool); const c = Math.random() < 0.5 ? p[0] : p[1];
        if (c !== target) set.add(c);
      }
      opts = shuffle(Array.from(set));
      q = { kind: "write", disp: k[2], ans: target, opts: opts, src: k[3], ex: k[4], exz: k[5] };
    }
    kanaQ = q;
  }
  function viewKana() {
    let h = '<h2>五十音训练</h2>';
    h += '<div class="chips">模式：';
    [["read", "认读（看假名选罗马字）"], ["write", "辨形（看罗马字选假名）"], ["confuse", "易混对专项"]].forEach(function (m) {
      h += '<button class="chip' + (kanaState.mode === m[0] ? " on" : "") + '" data-kmode="' + m[0] + '">' + m[1] + '</button>';
    });
    h += '</div><div class="chips">范围：';
    h += '<button class="chip' + (kanaState.scope === "all" ? " on" : "") + '" data-kscope="all">全部</button>';
    h += '<button class="chip' + (kanaState.scope === "清音" ? " on" : "") + '" data-kscope="清音">清音</button>';
    h += '<button class="chip' + (kanaState.scope === "浊拗" ? " on" : "") + '" data-kscope="浊拗">浊音·拗音</button>';
    ROWS.forEach(function (r) {
      h += '<button class="chip' + (kanaState.scope === r.name ? " on" : "") + '" data-kscope="' + r.name + '">' + r.name + '</button>';
    });
    h += '</div>';
    h += '<div id="kq" class="qbox"></div>';
    h += '<div class="chips"><button class="chip" id="kchart">五十音图</button><button class="chip" id="ktable">字源速查表</button><button class="chip" id="kconf">九组易混对</button></div>';
    h += '<div id="kextra"></div>';
    return h;
  }
  function renderKanaQ() {
    const box = $("#kq"); if (!box) return;
    if (!kanaQ) { box.innerHTML = '<p class="tip">当前范围无数据</p>'; return; }
    let h = '<div class="combo"></div>';
    if (kanaQ.kind === "confuse") {
      h += '<div class="qtitle">「' + esc(kanaQ.word) + '」中的假名是？</div>';
      h += '<div class="opts">';
      h += '<button class="opt big" data-kans="' + esc(kanaQ.a) + '">' + esc(kanaQ.a) + '</button>';
      h += '<button class="opt big" data-kans="' + esc(kanaQ.b) + '">' + esc(kanaQ.b) + '</button>';
      h += '</div><p class="tip">区分：' + esc(kanaQ.hint) + '</p>';
    } else if (kanaQ.kind === "read") {
      h += '<div class="qtitle big2">' + esc(kanaQ.disp) + '</div><div class="opts">';
      kanaQ.opts.forEach(function (o) { h += '<button class="opt" data-kans="' + esc(o) + '">' + esc(o) + '</button>'; });
      h += '</div><p class="tip">字源：' + (kanaQ.src || "—") + '　例词：' + esc(kanaQ.ex) + '（' + esc(kanaQ.exz) + '）</p>';
      h += '<button class="chip" id="kplay">🔊 朗读例词</button>';
    } else {
      h += '<div class="qtitle big2">' + esc(kanaQ.disp) + '</div><div class="opts">';
      kanaQ.opts.forEach(function (o) { h += '<button class="opt big" data-kans="' + esc(o) + '">' + esc(o) + '</button>'; });
      h += '</div><p class="tip">字源：' + (kanaQ.src || "—") + '　例词：' + esc(kanaQ.ex) + '（' + esc(kanaQ.exz) + '）</p>';
    }
    h += '<div id="kres" class="res"></div>';
    h += '<div class="keys"><span><kbd>1</kbd>-<kbd>4</kbd> 选择答案</span><span><kbd>Enter</kbd> 下一题</span><span><kbd>S</kbd> 发音</span></div>';
    box.innerHTML = h;
    const el = box.querySelector(".qbox, .qtitle");
    if (el && okPrev) el.classList.add("pop");
  }
  let okPrev = false;
  function answerKana(sel) {
    const ok = sel === kanaQ.ans;
    okPrev = ok;
    const k = kanaQ.ans;
    S.kanaStat[k] = S.kanaStat[k] || { r: 0, w: 0 };
    if (ok) { S.kanaStat[k].r++; addXp(5); } else S.kanaStat[k].w++;
    bumpCombo(ok); syncBadges(); save(); act();
    const res = $("#kres");
    if (res) res.innerHTML = '<span class="' + (ok ? "ok" : "no") + '">' + (ok ? "✓ 正确" : "✗ 正确是 " + esc(kanaQ.ans)) + '</span>';
    setTimeout(function () { nextKana(); renderKanaQ(); }, ok ? 550 : 1400);
  }

  /* ---------- 9. 视图：单词 SRS ---------- */
  // 学习 与 复习 是两套完全独立的状态：各自维护级别、课号范围、队列、进度
  let ls = { lv: "N5", queue: [], idx: 0, show: false, lesson: 0, kind: "learn" };
  let rs = { lv: "N5", queue: [], idx: 0, show: false, lesson: 0, kind: "review" };
  let vs = ls;   // 指向当前页面所用状态（进入路由时切换）
  let queueJustSet = false;   // 本次 render 前队列刚被显式设置过（评分/重建/切范围），不要自动重建
  function setStateFor(route) { vs = (route === "review") ? rs : ls; }
  function modeCounts(st) {
    return { due: dueList(st.lv).length, "new": newList(st.lv, 9999).length };
  }
  function buildQueue(fresh, force) {
    const st = vs;
    // 复习：只取「学过且到期」的词，与未学词彻底无关
    // 学习：只取「从没学过」的词
    if (st.kind === "review") {
      st.queue = shuffle(dueList(st.lv));
      if (st.lesson > 0) st.queue = st.queue.filter(function (v) { return v.l === st.lesson; });
    } else {
      // 每轮最多 10 个，避免一次给太多；force = 用户主动「超额再学」，忽略每日额度
      const quota = force ? 10 : Math.max(0, S.settings.newPerDay - S.today.new);
      st.queue = newList(st.lv, Math.min(quota, 10), st.lesson);
    }
    st.idx = 0; st.show = false;
  }
  // 最近一次到期时间与排队数量（用于告知「下次复习」）
  function nextDueInfo() {
    let min = Infinity, cnt = 0;
    const now = Date.now();
    LEVELS.forEach(function (L) {
      VOCAB[L].forEach(function (v) {
        const c = S.cards[v.id];
        if (c && c.due && c.due > now) { cnt++; if (c.due < min) min = c.due; }
      });
    });
    return { at: min === Infinity ? null : min, cnt: cnt };
  }
  function fmtWhen(ts) {
    const d = new Date(ts), now = new Date(), diff = ts - Date.now();
    const hh = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    if (diff < 3600000) return "约 " + Math.max(1, Math.round(diff / 60000)) + " 分钟后";
    if (d.toDateString() === now.toDateString()) return "今天 " + hh;
    const tm = new Date(now.getTime() + 86400000);
    if (d.toDateString() === tm.toDateString()) return "明天 " + hh;
    return (d.getMonth() + 1) + "月" + d.getDate() + "日 " + hh;
  }
  // 队列走完时的收尾提示：必须说清「为什么没词了」，否则用户会以为按钮坏了
  function doneHTML() {
    if (vs.kind === "review") {
      if (!Object.keys(S.cards).length) {
        return '<div class="done">还没有学过任何词<br><span class="tip">先去「学新词」建立第一批，之后这里才会出现复习内容</span><br><button class="btn" data-go="learn">去学新词</button></div>';
      }
      const nd = nextDueInfo();
      if (nd.at) {
        return '<div class="done">本轮复习完成 🎉<br><span class="tip">当前没有到期的词了 —— 下次复习：<b>' + fmtWhen(nd.at) + '</b>（还有 ' + nd.cnt + ' 个在排）</span><br><button class="btn" data-go="learn">趁现在学新词</button> <button class="chip" id="vbuild2">重新检查</button></div>';
      }
      return '<div class="done">当前没有可复习的词<br><span class="tip">已学的词都还没到复习时间</span><br><button class="btn" data-go="learn">去学新词</button></div>';
    }
    // 学习页
    const left = newList(vs.lv, 9999, vs.lesson).length;
    const quotaLeft = Math.max(0, S.settings.newPerDay - S.today.new);
    if (!left) {
      return '<div class="done">本级别（' + vs.lv + '）的词已全部学完 🎉<br><span class="tip">换个级别继续，或去复习巩固今天的成果</span><br><button class="btn" data-go="review">去复习</button></div>';
    }
    if (!quotaLeft) {
      return '<div class="done">今日新词额度已用完（' + S.today.new + '/' + S.settings.newPerDay + '）<br><span class="tip">本级别还有 ' + left + ' 个新词没学，想继续可以超额</span><br><button class="btn" id="vforce">超额再学 10 个</button> <button class="chip" data-go="review">去复习</button></div>';
    }
    return '<div class="done">本轮完成 🎉<br><span class="tip">本级别还有 ' + left + ' 个新词可学（今日额度剩余 ' + quotaLeft + '）</span><br><button class="btn" id="vbuild2">再来一轮</button></div>';
  }
  function viewVocab(st, isReview) {
    let h = '<h2>' + (isReview ? '复习 · 强化已学' : '学新词') + '</h2>';
    const mc = modeCounts(st);
    const cnt = isReview ? mc.due : mc["new"];
    h += '<p class="tip">' + (isReview
      ? '这里<b>只会出现你已经学过、且到了复习时间的词</b>。没背过的新词不会混进来 —— 想学新词请去「学新词」页。'
      : '这里<b>只会出现你从没背过的词</b>。已经学过的不在这里，巩固请去「复习」页。') + '</p>';
    h += '<div class="rowbox"><span>可练：<b>' + cnt + '</b> 个</span>'
      + '<button class="btn sm" data-go="' + (isReview ? 'learn' : 'review') + '">去' + (isReview ? '学新词' : '复习') + '</button></div>';
    h += '<div class="chips">级别：';
    LEVELS.forEach(function (L) {
      h += '<button class="chip' + (st.lv === L ? " on" : "") + '" data-vlv="' + L + '">' + L + '（' + VOCAB[L].length + '）</button>';
    });
    h += '</div><div class="chips">范围：<button class="chip' + (st.lesson === 0 ? " on" : "") + '" data-vl="0">全部</button>';
    const lessons = [];
    VOCAB[st.lv].forEach(function (v) { if (v.l && lessons.indexOf(v.l) < 0) lessons.push(v.l); });
    lessons.sort(function (a, b) { return a - b; }).forEach(function (l) {
      h += '<button class="chip' + (st.lesson === l ? " on" : "") + '" data-vl="' + l + '">' + (st.lv === "N5" || st.lv === "N4" ? "第" + l + "课" : "主题" + l) + '</button>';
    });
    h += '</div>';
    const quotaLeft = Math.max(0, S.settings.newPerDay - S.today.new);
    h += '<div class="rowbox">'
      + (isReview
        ? '<span>今日已复习：<b>' + S.today.rev + '</b></span><span>到期待复习：<b>' + mc.due + '</b></span>'
        : '<span>今日新学：<b>' + S.today.new + '</b>/' + S.settings.newPerDay + '</span><span>今日额度剩余：<b>' + quotaLeft + '</b></span><span>未学词：<b>' + mc["new"] + '</b></span>')
      + '<span>本轮剩余：<b>' + Math.max(0, st.queue.length - st.idx) + '</b></span><button class="btn sm" id="vbuild">重抽本轮</button></div>';
    h += queueNote(st, mc, quotaLeft);
    h += '<div id="vcard" class="card"></div>';
    return h;
  }
  // 说明「为什么本轮只有这么几个词」——否则用户会以为重抽功能坏了
  function queueNote(st, mc, quotaLeft) {
    if (!st.queue.length) return "";   // 空队列的情况由 doneHTML 说明
    const scope = st.lesson > 0 ? "（已按课号筛选）" : "";
    if (st.kind === "review") {
      return '<div class="tip2">本轮 <b>' + st.queue.length + '</b> 个到期词' + scope
        + ' —— 这就是当前<b>所有</b>「已学过且到期」的词，走完就没有了；没背过的新词不会出现在这里。</div>';
    }
    if (st.lesson > 0) {
      return '<div class="tip2">本轮 <b>' + st.queue.length + '</b> 个新词' + scope + '。</div>';
    }
    if (quotaLeft < 10) {
      return '<div class="tip2">本轮只有 <b>' + st.queue.length + '</b> 个 —— 因为<b>今日新词额度只剩 ' + quotaLeft + ' 个</b>'
        + '（每日额度 ' + S.settings.newPerDay + ' 个，可在「仪表盘 → 每日新词」调整）。'
        + '本级别还有 ' + mc["new"] + ' 个新词没学：<button class="chip sm" id="vforce2">超额再学 10 个</button></div>';
    }
    return '<div class="tip2">本轮 <b>' + st.queue.length + '</b> 个新词（都是你还没背过的）。</div>';
  }
  function viewLearn() { return viewVocab(ls, false); }
  function viewReview() { return viewVocab(rs, true); }
  function renderCard() {
    const box = $("#vcard"); if (!box) return;
    if (vs.idx >= vs.queue.length) { box.innerHTML = doneHTML(); return; }
    const v = vs.queue[vs.idx];
    const c = S.cards[v.id];
    const meta = v.lv + "　" + (v.custom ? "我的词库" : (v.lv === "N5" || v.lv === "N4" ? "第" + v.l + "课" : "主题" + v.l)) + "　" + esc(v.p || "")
      + (c ? "　复习 #" + c.n : "　<b>新词</b>") + (S.wrong.indexOf(v.id) >= 0 ? "　⚠ 错词" : "");
    const word = '<div class="cfront jp"><ruby>' + esc(v.w || v.k) + "<rt>" + (v.w ? esc(v.k) : "") + "</rt></ruby></div>";
    let h = '<div class="cwrap">';
    h += '<div class="cface"><div class="cmeta">' + meta + "</div>" + word;
    const hasLive = hasHuman(v.w, v.k) ? '<span class="badge-live">真人</span>' : "";
    h += '<button class="chip" id="vsay">🔊 朗读（S）' + hasLive + '</button>';
    h += '<div class="grades"><button class="btn" id="vshow">显示释义（空格）</button></div>';
    h += '<div class="hint">先自己回忆意思，再翻面评分 · 快捷键 <kbd>1</kbd>忘记 <kbd>2</kbd>困难 <kbd>3</kbd>良好 <kbd>4</kbd>简单</div></div>';
    h += '<div class="cface cback"><div class="cmeta">' + meta + "</div>" + word;
    h += '<div class="cmean">' + esc(v.z) + "</div>";
    h += '<div class="grades">'
      + '<button class="g again" data-g="0">忘记<kbd>1</kbd></button>'
      + '<button class="g hard" data-g="1">困难<kbd>2</kbd></button>'
      + '<button class="g good" data-g="2">良好<kbd>3</kbd></button>'
      + '<button class="g easy" data-g="3">简单<kbd>4</kbd></button></div>';
    h += '<div class="hint">评「忘记/困难」会自动进错词本，第二天优先重练</div></div>';
    h += "</div>";
    h += '<div class="combo"></div>';
    box.innerHTML = h;
    box.classList.toggle("flipped", !!vs.show);
    // 后台预取下一张的真人音，刷卡时几乎无感
    try { prefetchNext(); } catch (e) {}
  }

  /* ---------- 10. 视图：语法 ---------- */
  let gs = { lv: "N5", q: "" };
  function viewGrammar() {
    let h = '<h2>语法库</h2><div class="chips">级别：';
    LEVELS.forEach(function (L) {
      const n = GRAMMAR.filter(function (g) { return g.lv === L; }).length;
      h += '<button class="chip' + (gs.lv === L ? " on" : "") + '" data-glv="' + L + '">' + L + '（' + n + '）</button>';
    });
    h += '</div><div class="chips"><input id="gsearch" class="inp" placeholder="搜索条目 / 意思 / 例句…" value="' + esc(gs.q) + '"></div>';
    const q = gs.q.trim().toLowerCase();
    const list = GRAMMAR.filter(function (g) {
      if (g.lv !== gs.lv) return false;
      if (!q) return true;
      return (g.n + g.m + g.f + g.e + g.t).toLowerCase().indexOf(q) >= 0;
    });
    const known = list.filter(function (g) { return S.grammar[g.id]; }).length;
    h += '<div class="rowbox"><span>本级别条目：<b>' + list.length + '</b></span><span>已掌握：<b>' + known + '</b></span></div>';
    h += '<div class="glist">';
    list.forEach(function (g) {
      const on = !!S.grammar[g.id];
      h += '<div class="gitem' + (on ? " on" : "") + '"><div class="ghead" data-gid="' + g.id + '">';
      h += '<span class="gname">' + esc(g.n) + '</span><span class="gmean">' + esc(g.m) + '</span>';
      h += '<span class="gmark">' + (on ? "已掌握" : "标记") + '</span></div>';
      h += '<div class="gbody" id="gb-' + g.id + '" style="display:none">';
      h += '<div class="gform">接续：' + esc(g.f) + '</div>';
      h += '<div class="gex">' + esc(g.e) + '　<button class="chip sm" data-say="' + esc(g.e) + '">🔊</button></div>';
      h += '<div class="gtr">' + esc(g.t) + '</div></div></div>';
    });
    h += '</div>';
    return h;
  }

  /* ---------- 11. 视图：变形训练 ---------- */
  let ds = { kind: "verb", lv: "N5", q: null };
  function nextDrill() {
    if (ds.kind === "verb") {
      let pool = VERBS.filter(function (v) { return ds.lv === "ALL" || v.lv === ds.lv; });
      if (!pool.length) pool = VERBS;
      const v = pick(pool);
      const f = pick(FORMS);
      ds.q = { type: "v", w: v, form: f, ans: conj(v.k, v.t, f[0]) };
    } else {
      let pool = ADJS.filter(function (a) { return ds.lv === "ALL" || a.lv === ds.lv; });
      if (!pool.length) pool = ADJS;
      const a = pick(pool);
      const f = pick(ADJ_FORMS);
      ds.q = { type: "a", w: a, form: f, ans: conjAdj(a.k, a.t, f[0]) };
    }
  }
  function viewDrill() {
    let h = '<h2>变形训练</h2><div class="chips">类型：';
    h += '<button class="chip' + (ds.kind === "verb" ? " on" : "") + '" data-dk="verb">动词变形</button>';
    h += '<button class="chip' + (ds.kind === "adj" ? " on" : "") + '" data-dk="adj">形容词变形</button></div>';
    h += '<div class="chips">难度：';
    ["N5", "N4", "N3", "N2", "N1", "ALL"].forEach(function (L) {
      h += '<button class="chip' + (ds.lv === L ? " on" : "") + '" data-dlv="' + L + '">' + L + '</button>';
    });
    h += '</div>';
    h += '<div class="rowbox"><span>正确：<b>' + S.drill.r + '</b></span><span>错误：<b>' + S.drill.w + '</b></span><span>正确率：<b>' + (S.drill.r + S.drill.w ? Math.round(S.drill.r / (S.drill.r + S.drill.w) * 100) : 0) + '%</b></span></div>';
    h += '<div id="dq" class="qbox"></div>';
    h += '<div class="chips"><button class="chip" id="dtable">变形规则速查</button></div><div id="dextra"></div>';
    return h;
  }
  function renderDrill() {
    const box = $("#dq"); if (!box) return;
    if (!ds.q) nextDrill();
    const q = ds.q;
    let h = '<div class="qtitle">' + esc(q.w.w || q.w.k) + '　<span class="rt">' + esc(q.w.k) + '</span>　<span class="tag">' + (q.w.t === 1 ? "一类" : q.w.t === 2 ? "二类" : q.type === "v" ? "三类" : esc(q.w.t)) + '</span></div>';
    h += '<div class="qask">改成「<b>' + esc(q.form[1]) + '</b>」（' + esc(q.form[3] || "") + '）　' + esc(q.w.z) + '</div>';
    h += '<input id="dinput" class="inp big" placeholder="输入变形后的读音（假名）" autocomplete="off">';
    h += '<div class="chips"><button class="btn" id="dok">提交</button><button class="chip" id="dpass">看答案</button></div>';
    h += '<div id="dres" class="res"></div>';
    box.innerHTML = h;
    const inp = $("#dinput");
    if (inp) {
      inp.focus();
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") $("#dok").click(); });
    }
  }
  function checkDrill() {
    const inp = $("#dinput"); if (!inp) return;
    const val = inp.value.trim().replace(/\s/g, "");
    const ans = ds.q.ans;
    const ok = val === ans;
    S.drill.r += ok ? 1 : 0; S.drill.w += ok ? 0 : 1;
    S.drill.log.push({ q: ds.q.w.k, f: ds.q.form[0], ok: ok, t: Date.now() });
    if (S.drill.log.length > 200) S.drill.log = S.drill.log.slice(-200);
    save(); act();
    let h = '<span class="' + (ok ? "ok" : "no") + '">' + (ok ? "✓ 正确" : "✗ 正确：" + esc(ans)) + '</span>';
    h += '<div class="tip">';
    if (ds.q.type === "v") h += ruleText(ds.q.w.t, ds.q.form[0]);
    else h += "形容词变形规则见「变形规则速查」";
    h += '</div><button class="btn" id="dnext">下一题</button>';
    $("#dres").innerHTML = h;
  }
  function ruleText(type, form) {
    if (type === 1) {
      const M = {
        masu: "一类动词：词尾う段 → い段 + ます",
        te: "一类：く→いて／ぐ→いで／す→して／つ・る・う→って／ぬ・ぶ・む→んで（行く→行って）",
        ta: "一类：把て形的て→た、で→だ",
        nai: "一类：词尾う段 → あ段 + ない（う→わない）",
        base: "基本形（辞书形）即原形",
        kanou: "一类：词尾う段 → え段 + る",
        ishi: "一类：词尾う段 → お段 + う",
        ba: "一类：词尾う段 → え段 + ば",
        ukemi: "一类：词尾う段 → あ段 + れる",
        shieki: "一类：词尾う段 → あ段 + せる",
        meirei: "一类：词尾う段 → え段"
      };
      return M[form] || "";
    }
    if (type === 2) return "二类动词：去掉「る」＋ ます/て/た/ない/られる/よう/れば/させる/ろ";
    return "三类：する→し＋ます/て/た/ない/よう/れば；可能＝できる；受身＝される；使役＝させる（来る：きます/きて/きた/こない/こられる/こよう/くれば/こい）";
  }

  /* ---------- 11b. 视图：错词本 ---------- */
  let VMAP = null;
  function vmap() {
    if (!VMAP) {
      VMAP = {};
      LEVELS.forEach(function (L) { (VOCAB[L] || []).forEach(function (v) { VMAP[v.id] = v; }); });
    }
    return VMAP;
  }
  function wrongItems() { const m = vmap(); return S.wrong.map(function (id) { return m[id]; }).filter(Boolean); }
  function viewWrong() {
    const items = wrongItems();
    let h = '<h2>错词本</h2>';
    h += '<div class="rowbox"><span>错词：<b>' + items.length + '</b> 个</span>'
      + '<button class="btn sm" id="wtrain">开始重练</button>'
      + '<button class="chip danger" id="wclear">清空错词本</button>'
      + '<span class="tip">评「忘记/困难」的卡片会自动收集到这里</span></div>';
    if (!items.length) { h += '<p class="tip">还没有错词。去做单词卡，评「忘记」的词会出现在这里。</p>'; return h; }
    h += '<div class="glist">';
    items.slice(0, 300).forEach(function (v) {
      h += '<div class="gitem"><div class="ghead"><span class="gname jp">' + esc(v.w || v.k) + '</span>'
        + '<span class="gmean">' + esc(v.z) + '　<span class="rt">' + esc(v.k) + '</span></span>'
        + '<span class="gmark">' + v.lv + '</span></div></div>';
    });
    h += '</div>';
    return h;
  }

  /* ---------- 11b. 视图：我的词库（用户自定义） ---------- */
  const cst = { tab: "vocab", q: "", lv: "N5", p: "名" };
  const PARTS = ["名", "动1", "动2", "动3", "形1", "形2", "副", "连体", "叹", "助", "接", "代"];
  function lvSelect(id, cur) {
    let s = '<select id="' + id + '" class="inp">';
    LEVELS.forEach(function (L) { s += '<option value="' + L + '"' + (L === cur ? " selected" : "") + '>' + L + '</option>'; });
    return s + '</select>';
  }
  function partSelect(id, cur) {
    let s = '<select id="' + id + '" class="inp">';
    PARTS.forEach(function (p) { s += '<option value="' + p + '"' + (p === cur ? " selected" : "") + '>' + p + '</option>'; });
    return s + '</select>';
  }
  function viewCustom() {
    const cv = customVocab(), cg = customGrammar();
    let h = '<h2>我的词库</h2>';
    h += '<p class="tip">添加的条目会<b>按你指定的等级并入对应单词卡队列</b>（或语法库），和内置内容一起复习、一起统计进度。动词若填基本形（如 つくる），还会自动进入变形训练。数据存在本机浏览器，随进度备份一起导出。</p>';
    h += '<div class="chips">';
    h += '<button class="chip' + (cst.tab === "vocab" ? " on" : "") + '" data-ctab="vocab">单词（' + cv.length + '）</button>';
    h += '<button class="chip' + (cst.tab === "grammar" ? " on" : "") + '" data-ctab="grammar">语法（' + cg.length + '）</button>';
    h += '<button class="chip' + (cst.tab === "import" ? " on" : "") + '" data-ctab="import">批量导入</button>';
    h += '</div>';

    if (cst.tab === "vocab") {
      h += '<div class="cform">';
      h += '<div class="crow">' + lvSelect("clv", cst.lv) + partSelect("cp", cst.p)
        + '<input id="ck" class="inp" placeholder="假名读音（必填，如 つくる）" autocomplete="off">'
        + '<input id="cw" class="inp" placeholder="汉字表记（选填，如 作る）" autocomplete="off">'
        + '<input id="cz" class="inp" placeholder="中文释义（必填）" autocomplete="off">'
        + '<button class="btn" id="cadd">添加</button></div>';
      h += '<div class="tip2">词性说明：动1＝五段（つくる）　动2＝一段（たべる）　动3＝する/くる　形1＝い形容词　形2＝な形容词</div>';
      h += '</div>';
      h += '<div class="crow"><input id="csearch" class="inp" placeholder="搜索已添加的词（假名 / 汉字 / 释义）" value="' + esc(cst.q) + '" autocomplete="off">'
        + '<button class="chip" id="cexport">导出词库</button>'
        + '<button class="chip danger" id="cclear">清空单词</button></div>';
      const q = cst.q.trim();
      const list = cv.filter(function (v) {
        return !q || v.k.indexOf(q) >= 0 || (v.w || "").indexOf(q) >= 0 || (v.z || "").indexOf(q) >= 0;
      }).slice().reverse();
      if (!list.length) { h += '<p class="tip">' + (cv.length ? "没有匹配的词。" : "还没有自定义单词，用上面的表单添加，或去「批量导入」一次性粘贴进来。") + '</p>'; }
      h += '<div class="glist">';
      list.slice(0, 400).forEach(function (v) {
        h += '<div class="gitem"><div class="ghead">'
          + '<span class="gname jp">' + esc(v.w || v.k) + '</span>'
          + '<span class="gmean">' + esc(v.z) + '　<span class="rt">' + esc(v.k) + '</span></span>'
          + '<span class="gmark">' + v.lv + '・' + esc(v.p || "") + '</span>'
          + '<button class="chip sm danger" data-cdel="' + v.id + '" data-ckind="vocab">删除</button>'
          + '</div></div>';
      });
      h += '</div>';
      if (list.length > 400) h += '<p class="tip">仅显示最近 400 条，可用搜索缩小范围。</p>';
    } else if (cst.tab === "grammar") {
      h += '<div class="cform">';
      h += '<div class="crow">' + lvSelect("clv", cst.lv)
        + '<input id="cgn" class="inp" placeholder="条目（必填，如 ～ことができます）" autocomplete="off">'
        + '<input id="cgf" class="inp" placeholder="接续（如 动-基本形＋）" autocomplete="off">'
        + '<input id="cgm" class="inp" placeholder="意思（必填）" autocomplete="off"></div>';
      h += '<div class="crow">'
        + '<input id="cge" class="inp" placeholder="例句（选填）" autocomplete="off">'
        + '<input id="cgt" class="inp" placeholder="例句翻译（选填）" autocomplete="off">'
        + '<button class="btn" id="caddg">添加语法</button></div>';
      h += '</div>';
      if (!cg.length) { h += '<p class="tip">还没有自定义语法条目。</p>'; }
      h += '<div class="glist">';
      cg.slice().reverse().forEach(function (g) {
        h += '<div class="gitem"><div class="ghead">'
          + '<span class="gname jp">' + esc(g.n) + '</span>'
          + '<span class="gmean">' + esc(g.m) + '　<span class="rt">' + esc(g.f || "") + '</span></span>'
          + '<span class="gmark">' + g.lv + '</span>'
          + '<button class="chip sm danger" data-cdel="' + g.id + '" data-ckind="grammar">删除</button>'
          + '</div>';
        if (g.e) h += '<div class="gex jp">' + esc(g.e) + (g.t ? '<div class="gtr">' + esc(g.t) + '</div>' : '') + '</div>';
        h += '</div>';
      });
      h += '</div>';
    } else {
      h += '<h3>批量导入</h3>';
      h += '<p class="tip">每行一条，用<b>制表符 / 逗号 / 空格</b>分隔。列数自动识别：<br>'
        + '2 列：<code>假名　中文</code><br>'
        + '3 列：<code>假名　汉字　中文</code><br>'
        + '4 列：<code>假名　汉字　中文　词性</code><br>'
        + '也支持直接粘贴 JSON 数组（含 k / w / z / p 字段）。动词建议填<b>基本形</b>。</p>';
      h += '<div class="crow">' + lvSelect("clv", cst.lv) + '<span class="tip2">整批归入</span></div>';
      h += '<textarea id="cbulk" class="inp big2" rows="10" placeholder="つくる　作る　做，制造　动1&#10;たべる　食べる　吃　动2&#10;しずか　静か　安静　形2"></textarea>';
      h += '<div class="chips"><button class="btn" id="cbulkdo">解析并导入</button><button class="chip" id="cbulkclear">清空输入框</button></div>';
      h += '<div id="cpreview"></div>';
    }
    return h;
  }

  /* ---------- 11c. 视图：听写 / 翻译练习 ---------- */
  const SCOPES = [["learned", "已学"], ["all", "本级全部"], ["wrong", "错词本"]];
  let dct = { lv: "N5", scope: "learned", q: null, r: 0, w: 0, revealed: false };
  let trn = { lv: "N5", dir: "j2c", q: null, opts: [], r: 0, w: 0, picked: -1 };

  function drillPool(scope, lv) {
    const out = [];
    LEVELS.forEach(function (L) {
      if (lv && L !== lv) return;
      VOCAB[L].forEach(function (v) {
        if (scope === "learned" && !S.cards[v.id]) return;
        if (scope === "wrong" && S.wrong.indexOf(v.id) < 0) return;
        out.push(v);
      });
    });
    return out;
  }
  // 答案归一化：去空白、全角转半角、统一小写
  function normAns(s) {
    return String(s == null ? "" : s).trim().replace(/\s+/g, "")
      .replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .toLowerCase();
  }
  function matchWord(v, val) {
    const a = normAns(val);
    if (!a) return false;
    return a === normAns(v.k) || (v.w && a === normAns(v.w));
  }
  function playWord(v, slow) {
    if (!v) return;
    if (slow) {
      const old = S.settings.ttsRate;
      S.settings.ttsRate = 0.6;
      tts(v.k);
      setTimeout(function () { S.settings.ttsRate = old; }, 900);
      return;
    }
    speak(v.k, { kanji: v.w, kana: v.k });
  }
  function rateOf(r, w) { return (r + w) ? Math.round(r / (r + w) * 100) : 0; }

  /* —— 听写 —— */
  function nextDict() {
    const pool = drillPool(dct.scope, dct.lv);
    dct.q = pool.length ? pick(pool) : null;
    dct.revealed = false;
  }
  function viewDict() {
    let h = '<h2>听写练习</h2>';
    h += '<p class="tip">听发音写出单词（假名或汉字均可）。建议先用单词卡学完一批再回来，效果最好。</p>';
    h += '<div class="chips">级别：';
    LEVELS.forEach(function (L) {
      h += '<button class="chip' + (dct.lv === L ? " on" : "") + '" data-dtlv="' + L + '">' + L + '</button>';
    });
    h += '</div><div class="chips">范围：';
    SCOPES.forEach(function (s) {
      h += '<button class="chip' + (dct.scope === s[0] ? " on" : "") + '" data-dtscope="' + s[0] + '">' + s[1] + '</button>';
    });
    h += '</div>';
    h += '<div class="rowbox"><span>正确：<b>' + dct.r + '</b></span><span>错误：<b>' + dct.w + '</b></span><span>正确率：<b>' + rateOf(dct.r, dct.w) + '%</b></span></div>';
    h += '<div id="dctq" class="qbox"></div>';
    return h;
  }
  function renderDict() {
    const box = $("#dctq"); if (!box) return;
    if (!dct.q) { box.innerHTML = '<p class="tip">当前范围没有可练的词，换个级别或选「本级全部」。</p>'; return; }
    const v = dct.q;
    const live = hasHuman(v.w, v.k) ? '<span class="badge-live">真人</span>' : '';
    let h = '<div class="qask">听发音，写出这个单词' + live + '</div>';
    h += '<div class="chips"><button class="btn" id="dctplay">🔊 播放</button><button class="chip" id="dctslow">慢速</button><button class="chip" id="dctshow">看答案</button></div>';
    h += '<input id="dctin" class="inp big" placeholder="输入假名或���字" autocomplete="off">';
    h += '<div class="chips"><button class="btn" id="dctok">提交（Enter）</button><button class="chip" id="dctnext">下一题</button></div>';
    h += '<div id="dctres" class="res"></div>';
    if (dct.revealed) {
      h += '<div class="gex jp"><b>' + esc(v.w || v.k) + '</b>　<span class="rt">' + esc(v.k) + '</span><div class="gtr">' + esc(v.z) + '　' + esc(v.p || '') + '</div></div>';
    }
    box.innerHTML = h;
    playWord(v);
    const inp = $("#dctin");
    if (inp) {
      inp.focus();
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") $("#dctok").click(); });
    }
  }
  function answerHTML(v) {
    return '<div class="gex jp"><b>' + esc(v.w || v.k) + '</b>　<span class="rt">' + esc(v.k) + '</span><div class="gtr">' + esc(v.z) + '　' + esc(v.p || '') + '</div></div>';
  }
  // 插入答案块前先清掉所有旧的，保证页面上永远只有一个（原先会越点越多）
  function insertAnswer(v) {
    const box = $("#dctq");
    if (!box) return;
    if (box.querySelectorAll) {
      const olds = box.querySelectorAll(".gex");
      for (let i = 0; i < olds.length; i++) { if (olds[i].remove) olds[i].remove(); }
    }
    if (box.insertAdjacentHTML) box.insertAdjacentHTML("beforeend", answerHTML(v));
  }
  function checkDict() {
    const inp = $("#dctin"); if (!inp || !dct.q) return;
    const v = dct.q;
    const ok = matchWord(v, inp.value);
    dct.r += ok ? 1 : 0; dct.w += ok ? 0 : 1;
    if (!ok) pushWrong(v.id); else popWrong(v.id);
    dct.revealed = true;
    save(); act();
    let h = '<span class="' + (ok ? "ok" : "no") + '">' + (ok ? "✓ 正确" : "✗ 正确：" + esc(v.w || v.k) + "（" + esc(v.k) + "）") + '</span>';
    h += '<div class="tip">' + esc(v.z) + '　' + esc(v.p || "") + '</div>';
    const res = $("#dctres"); if (res) res.innerHTML = h;
    insertAnswer(v);
  }

  /* —— 翻译 —— */
  function nextTrans() {
    const pool = drillPool("all", trn.lv);
    if (!pool.length) { trn.q = null; return; }
    trn.q = pick(pool);
    trn.picked = -1;
    if (trn.dir === "j2c") {
      const set = [trn.q.z];
      let guard = 0;
      while (set.length < 4 && guard++ < 80) {
        const c = pick(pool);
        if (c && c.z && set.indexOf(c.z) < 0) set.push(c.z);
      }
      trn.opts = shuffle(set);
    } else trn.opts = [];
  }
  function viewTrans() {
    let h = '<h2>翻译练习</h2>';
    h += '<p class="tip">日译中：看日文选中文释义。中译日：看中文写出日文（假名或汉字）。</p>';
    h += '<div class="chips">级别：';
    LEVELS.forEach(function (L) {
      h += '<button class="chip' + (trn.lv === L ? " on" : "") + '" data-trlv="' + L + '">' + L + '</button>';
    });
    h += '</div><div class="chips">方向：';
    h += '<button class="chip' + (trn.dir === "j2c" ? " on" : "") + '" data-trdir="j2c">日 → 中（选择）</button>';
    h += '<button class="chip' + (trn.dir === "c2j" ? " on" : "") + '" data-trdir="c2j">中 → 日（拼写）</button>';
    h += '</div>';
    h += '<div class="rowbox"><span>正确：<b>' + trn.r + '</b></span><span>错误：<b>' + trn.w + '</b></span><span>正确率：<b>' + rateOf(trn.r, trn.w) + '%</b></span></div>';
    h += '<div id="trq" class="qbox"></div>';
    return h;
  }
  function renderTrans() {
    const box = $("#trq"); if (!box) return;
    if (!trn.q) { box.innerHTML = '<p class="tip">该级别暂无词条。</p>'; return; }
    const v = trn.q;
    let h = "";
    if (trn.dir === "j2c") {
      h += '<div class="qtitle jp">' + esc(v.w || v.k) + '</div>';
      h += '<div class="qask"><span class="rt">' + esc(v.k) + '</span>　' + esc(v.p || "") + '</div>';
      h += '<div class="opts">';
      trn.opts.forEach(function (o, i) {
        let cls = "opt";
        if (trn.picked >= 0) {
          if (o === v.z) cls += " ok";
          else if (i === trn.picked) cls += " no";
        }
        h += '<button class="' + cls + '" data-tropt="' + esc(o) + '">' + esc(o) + '</button>';
      });
      h += '</div>';
      if (trn.picked >= 0) h += '<div class="res"><span class="' + (trn.opts[trn.picked] === v.z ? "ok" : "no") + '">' + (trn.opts[trn.picked] === v.z ? "✓ 正确" : "✗ 正确答案：" + esc(v.z)) + '</span></div>';
      h += '<div class="chips"><button class="btn" id="trnext">下一题</button><button class="chip" id="trsay">🔊 读一下</button></div>';
    } else {
      h += '<div class="qtitle">' + esc(v.z) + '</div>';
      h += '<div class="qask">写出对应的日文　' + esc(v.p || "") + '</div>';
      h += '<input id="trin" class="inp big" placeholder="输入假名或汉字" autocomplete="off">';
      h += '<div class="chips"><button class="btn" id="trok">提交（Enter）</button><button class="chip" id="trshow">看答案</button><button class="chip" id="trnext">下一题</button></div>';
      h += '<div id="trres" class="res"></div>';
    }
    box.innerHTML = h;
    const inp = $("#trin");
    if (inp) {
      inp.focus();
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") $("#trok").click(); });
    }
  }

  /* ---------- 11d. 视图：文章精读 ---------- */
  let rd = {
    lv: "N5", cur: null, stage: "read", showK: true, showZ: false,
    bi: 0, br: 0, bw: 0, rev: false,        // 填空
    qi: 0, qr: 0, qw: 0, pick: -1           // 理解题
  };
  function blanksOf(art) {
    const out = [];
    art.s.forEach(function (s, i) { if (s.b) out.push(i); });
    return out;
  }
  function matchBlank(b, val) {
    const v = normAns(val);
    if (!v) return false;
    return v === normAns(b.a) || v === normAns(b.k);
  }
  function saveReadResult(a) {
    if (!S.reading) S.reading = {};
    S.reading[a.id] = { blank: { r: rd.br, w: rd.bw }, quiz: { r: rd.qr, w: rd.qw }, at: Date.now() };
    save();
  }
  function saySentence(a, i) {
    const s = a.s[i];
    if (s) tts(s.j);
  }
  // 通读全文：逐句朗读，按字数估算间隔
  let readingTimer = null;
  function playAll(a) {
    if (readingTimer) { clearTimeout(readingTimer); readingTimer = null; return; }
    let i = 0;
    const step = function () {
      if (i >= a.s.length) { readingTimer = null; return; }
      tts(a.s[i].j);
      const dur = Math.max(1600, a.s[i].j.length * 280 + 700);
      i++;
      readingTimer = setTimeout(step, dur);
    };
    step();
  }
  function bindReadInput() {
    const inp = $("#rdin");
    if (inp) {
      inp.focus();
      inp.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { const b = $("#rdok"); if (b) b.click(); }
      });
    }
  }
  function viewRead() {
    return rd.cur ? readArticleHTML() : readListHTML();
  }
  function readListHTML() {
    let h = '<h2>文章精读</h2>';
    h += '<p class="tip">把背过的单词和语法放进短文里真正用一遍。可以逐句听发音、随时对照中文，再做<b>填空</b>（练语法结构与搭配）和<b>理解题</b>（检验读懂了没有）。</p>';
    h += '<div class="chips">级别：';
    LEVELS.forEach(function (L) {
      const n = READING.filter(function (a) { return a.lv === L; }).length;
      h += '<button class="chip' + (rd.lv === L ? " on" : "") + '" data-rdlv="' + L + '">' + L + '（' + n + '）</button>';
    });
    h += '</div>';
    const list = READING.filter(function (a) { return a.lv === rd.lv; });
    if (!list.length) {
      h += '<p class="tip">该级别暂时还没有文章。目前 N5 / N4 各有若干篇，更高等级在陆续补充。</p>';
      return h;
    }
    h += '<div class="glist">';
    list.forEach(function (a) {
      const st = S.reading && S.reading[a.id];
      const bn = blanksOf(a).length;
      h += '<div class="gitem"><div class="ghead rdopen" data-rdopen="' + a.id + '">'
        + '<span class="gname jp">' + esc(a.t) + '</span>'
        + '<span class="gmean">' + esc(a.zh) + '　<span class="rt">' + a.s.length + ' 句 · ' + bn + ' 空 · ' + a.q.length + ' 题</span></span>'
        + (st ? '<span class="gmark">已练过</span>' : '<span class="gmark">未开始</span>')
        + '</div></div>';
    });
    h += '</div>';
    return h;
  }
  function readArticleHTML() {
    const a = rd.cur;
    let h = '<h2>' + esc(a.t) + '　<span class="rt">' + esc(a.zh) + '</span></h2>';
    h += '<div class="chips">';
    h += '<button class="chip" data-rdback="1">← 文章列表</button>';
    h += '<button class="chip' + (rd.stage === "read" ? " on" : "") + '" data-rdstage="read">阅读</button>';
    h += '<button class="chip' + (rd.stage === "blank" ? " on" : "") + '" data-rdstage="blank">填空练习</button>';
    h += '<button class="chip' + (rd.stage === "quiz" ? " on" : "") + '" data-rdstage="quiz">理解题</button>';
    h += '</div>';
    if (rd.stage === "read") h += readStageHTML(a);
    else if (rd.stage === "blank") h += blankStageHTML(a);
    else h += quizStageHTML(a);
    return h;
  }
  function readStageHTML(a) {
    let h = '<div class="chips">';
    h += '<button class="chip' + (rd.showK ? " on" : "") + '" id="rdk">显示假名</button>';
    h += '<button class="chip' + (rd.showZ ? " on" : "") + '" id="rdz">显示中文</button>';
    h += '<button class="chip" id="rdplayall">通读全文</button>';
    h += '</div><div class="rart">';
    a.s.forEach(function (s, i) {
      h += '<div class="rline">';
      h += '<button class="rsay" data-rsay="' + i + '" title="朗读这句">' + (i + 1) + '</button>';
      h += '<div class="rbody">';
      h += '<div class="rj jp">' + esc(s.j) + '</div>';
      if (rd.showK) h += '<div class="rk">' + esc(s.k) + '</div>';
      if (rd.showZ) h += '<div class="rz">' + esc(s.z) + '</div>';
      if (s.g) h += '<div class="rgtags">' + esc(s.g) + '</div>';
      h += '</div></div>';
    });
    h += '</div>';
    const bn = blanksOf(a).length;
    h += '<div class="chips"><button class="btn" data-rdstage="blank">开始填空练习（' + bn + ' 空）</button>'
      + '<button class="chip" data-rdstage="quiz">直接做理解题</button></div>';
    h += '<p class="tip">点左边的序号可以朗读该句。假名和中文可以随时关掉，先自己读懂再打开对照。</p>';
    return h;
  }
  function blankStageHTML(a) {
    const bs = blanksOf(a);
    if (!bs.length) return '<p class="tip">这篇文章没有设置填空。</p>';
    if (rd.bi >= bs.length) {
      saveReadResult(a);
      return '<div class="done">填空完成 🎉<br><span class="tip">正确 <b>' + rd.br + '</b> / ' + (rd.br + rd.bw)
        + '（' + rateOf(rd.br, rd.bw) + '%）</span><br>'
        + '<button class="btn" data-rdstage="quiz">继续做理解题</button> '
        + '<button class="chip" data-rdrestart="1">再做一遍</button></div>';
    }
    const s = a.s[bs[rd.bi]];
    const qj = s.j.split(s.b.a).join('<b class="blank">____</b>');
    const qk = s.k.split(s.b.k).join('____');
    let h = '<div class="rowbox"><span>第 <b>' + (rd.bi + 1) + '</b> / ' + bs.length + ' 空</span>'
      + '<span>正确 <b>' + rd.br + '</b></span><span>错误 <b>' + rd.bw + '</b></span>'
      + '<button class="btn sm" id="rdplaycur">🔊 听这句</button></div>';
    h += '<div class="qbox">';
    h += '<div class="qask">填入合适的词　<span class="tip2">' + esc(s.b.h || "") + '</span></div>';
    h += '<div class="rblank jp">' + qj + '</div>';
    h += '<div class="rk">' + esc(qk) + '</div>';
    h += '<input id="rdin" class="inp big" placeholder="输入答案（假名或汉字都可以）" autocomplete="off">';
    h += '<div class="chips"><button class="btn" id="rdok">提交（Enter）</button>'
      + '<button class="chip" id="rdshow">看答案</button>'
      + '<button class="chip" id="rdskip">跳过这空</button></div>';
    h += '<div id="rdres" class="res"></div>';
    h += '</div>';
    return h;
  }
  function quizStageHTML(a) {
    if (!a.q.length) return '<p class="tip">这篇文章没有理解题。</p>';
    if (rd.qi >= a.q.length) {
      saveReadResult(a);
      return '<div class="done">理解题完成 🎉<br><span class="tip">正确 <b>' + rd.qr + '</b> / ' + (rd.qr + rd.qw)
        + '（' + rateOf(rd.qr, rd.qw) + '%）</span><br>'
        + '<button class="chip" data-rdrestart="1">重做本篇</button> '
        + '<button class="btn" data-rdback="1">返回文章列表</button></div>';
    }
    const q = a.q[rd.qi];
    let h = '<div class="rowbox"><span>第 <b>' + (rd.qi + 1) + '</b> / ' + a.q.length + ' 题</span>'
      + '<button class="chip sm" data-rdstage="read">回看文章</button></div>';
    h += '<div class="qbox">';
    h += '<div class="qask jp" style="font-size:17px">' + esc(q.q) + '</div>';
    h += '<div class="opts">';
    q.o.forEach(function (o, i) {
      let cls = "opt";
      if (rd.pick >= 0) { if (i === q.a) cls += " ok"; else if (i === rd.pick) cls += " no"; }
      h += '<button class="' + cls + '" data-rdopt="' + i + '">' + esc(o) + '</button>';
    });
    h += '</div>';
    if (rd.pick >= 0) {
      h += '<div class="res"><span class="' + (rd.pick === q.a ? "ok" : "no") + '">'
        + (rd.pick === q.a ? "✓ 正确" : "✗ 正确答案：" + esc(q.o[q.a])) + '</span>'
        + '<div class="tip">' + esc(q.z) + '</div></div>';
      h += '<div class="chips"><button class="btn" id="rdnextq">下一题</button></div>';
    }
    h += '</div>';
    return h;
  }

  /* ---------- 12. 视图：仪表盘 ---------- */
  function viewDash() {
    rollDay();
    const t = today();
    const done = S.checkin.days.indexOf(t) >= 0;
    let h = '<h2>学习仪表盘</h2>';
    h += '<div class="dgrid">';
    h += '<div class="dbox"><div class="dnum">' + S.checkin.streak + '</div><div class="dlab">连续打卡天</div></div>';
    h += '<div class="dbox"><div class="dnum">' + Object.keys(S.cards).length + '</div><div class="dlab">已学单词</div></div>';
    h += '<div class="dbox"><div class="dnum">' + Object.keys(S.grammar).length + '</div><div class="dlab">掌握语法</div></div>';
    h += '<div class="dbox"><div class="dnum">' + (S.drill.r + S.drill.w) + '</div><div class="dlab">变形练习</div></div>';
    h += '<div class="dbox"><div class="dnum">' + S.best + '</div><div class="dlab">最高连击</div></div>';
    h += '<div class="dbox"><div class="dnum">Lv.' + levelOf() + '</div><div class="dlab">等级（' + S.xp + ' XP）</div></div>';
    h += '</div>';
    h += '<div class="chips"><button class="btn' + (done ? " ghost" : "") + '" id="checkin">' + (done ? "今日已打卡 ✓" : "今日打卡") + '</button>';
    h += '<button class="chip" id="setgoal">目标：' + S.settings.goal + '</button>';
    h += '<button class="chip" id="setnew">每日新词：' + S.settings.newPerDay + '</button>';
    h += '<button class="chip" id="exp">导出进度备份</button>';
    h += '<label class="chip" for="impf">导入进度</label><input type="file" id="impf" accept="application/json" style="display:none">';
    h += '<button class="chip" data-go="wrong">错词本（' + S.wrong.length + '）</button>';
    h += '<button class="chip danger" id="reset">清空进度</button></div>';

    // 发音设置
    const AM = globalThis.AUDIO_MAP;
    const amTotal = AM ? Object.keys(AM).length : 0;
    const mode = S.settings.audioMode || "auto";
    h += '<h3>发音设置</h3>';
    h += '<div class="audioset">';
    h += '<div class="arow"><span class="alab">音源</span><div class="chips">';
    h += '<button class="chip' + (mode === "auto" ? " on" : "") + '" data-amode="auto">自动（真人优先）</button>';
    h += '<button class="chip' + (mode === "human" ? " on" : "") + '" data-amode="human">仅真人</button>';
    h += '<button class="chip' + (mode === "tts" ? " on" : "") + '" data-amode="tts">仅 TTS</button>';
    h += '</div></div>';
    if (amTotal) h += '<div class="atip">真人音库已覆盖 <b>' + amTotal + '</b> 个词条（录音来自 JapanesePod101，需联网；未覆盖的自动回落 TTS）</div>';
    h += '<div class="arow"><span class="alab">TTS 语音</span><select id="voicesel">';
    const vlist = voiceList();
    if (!vlist.length) {
      h += '<option value="">系统默认（语音尚未加载，点右侧刷新）</option>';
    } else {
      h += '<option value="">自动选择最优</option>';
      for (let i = 0; i < vlist.length; i++) {
        const v = vlist[i];
        const sel = S.settings.voiceURI && (S.settings.voiceURI === v.voiceURI || S.settings.voiceURI === v.name) ? " selected" : "";
        h += '<option value="' + esc(v.voiceURI || v.name) + '"' + sel + '>' + esc(v.name) + (v.localService === false ? "（云端·更自然）" : "") + '</option>';
      }
    }
    h += '</select><button class="chip" id="vrefresh">刷新列表</button></div>';
    h += '<div class="arow"><span class="alab">TTS 语速</span><input type="range" id="ttsrate" min="0.5" max="1.3" step="0.05" value="' + (S.settings.ttsRate || 0.9) + '"><span class="aval" id="ttsrateval">' + (S.settings.ttsRate || 0.9) + '</span></div>';
    h += '<div class="arow"><span class="alab">真人语速</span><input type="range" id="humanrate" min="0.6" max="1.4" step="0.05" value="' + (S.settings.humanRate || 1) + '"><span class="aval" id="humanrateval">' + (S.settings.humanRate || 1) + '</span></div>';
    h += '<div class="chips"><button class="btn sm" id="audiotest">试听语音</button><button class="chip" id="audiotest2">试听真人音（日本語）</button></div>';
    h += '<div class="atip">音色最好的是 Chrome/Edge 的 <b>Google 日本語</b>（云端神经网络音，需联网）；Windows 11 可在「设置 → 时间和语言 → 语言和区域 → 日本語 → 语言选项 → 语音」安装 <b>Aoi / Naoki / Shiori</b> 神经语音包，装完点「刷新列表」即可选用。</div>';
    h += '<div class="arow"><span class="alab">真人音缓存</span><span id="cacnt" class="aval">读取中…</span>'
      + '<button class="chip sm" id="cwarm">缓存 ' + esc(S.settings.goal) + '</button>'
      + '<button class="chip sm" id="cwarmn5">缓存 N5</button>'
      + '<button class="chip sm" id="cwarmall">缓存全部</button>'
      + '<button class="chip sm danger" id="cclearcache">清空缓存</button></div>';
    h += '<div class="atip">真人音来自境外服务器，首次播放约 <b>5-9 秒</b>且偶发失败。缓存到本地后<b>秒播、可离线</b>。未缓存时若 2.5 秒内没出声，会自动用 TTS 先发声并继续后台缓存，下次即命中。系统<b>没有日语语音时不会朗读</b>，避免用中文语音念日语造成串台。</div>';
    h += '</div>';

    // 热力图（近 12 周）
    h += '<h3>近 12 周活跃度</h3><div class="heat">';
    const cells = [];
    for (let i = 83; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      const v = S.act[key] || 0;
      const lvl = v === 0 ? 0 : v < 10 ? 1 : v < 30 ? 2 : v < 60 ? 3 : 4;
      cells.push('<i class="h' + lvl + '" title="' + key + "：" + v + '"></i>');
    }
    h += cells.join("") + '</div>';

    // 各级别统计
    h += '<h3>分级进度</h3><div class="lvgrid">';
    LEVELS.forEach(function (L) {
      const tot = VOCAB[L].length || 1;
      const got = VOCAB[L].filter(function (v) { return S.cards[v.id]; }).length;
      const p = Math.round(got / tot * 100);
      const due = VOCAB[L].filter(function (v) { const c = S.cards[v.id]; return c && c.due && c.due <= Date.now(); }).length;
      const gk = GRAMMAR.filter(function (g) { return g.lv === L && S.grammar[g.id]; }).length;
      const gt = GRAMMAR.filter(function (g) { return g.lv === L; }).length;
      h += '<div class="lvrow"><div class="lvname">' + L + '</div><div class="bar"><i style="width:' + p + '%"></i></div><div class="lvnum">' + got + '/' + tot + '（' + p + '%）　待复习 ' + due + '　语法 ' + gk + '/' + gt + '</div></div>';
    });
    h += '</div>';

    // 假名薄弱项
    const weak = Object.keys(S.kanaStat).map(function (k) {
      const s = S.kanaStat[k]; return { k: k, w: s.w, r: s.r };
    }).filter(function (x) { return x.w > 0; }).sort(function (a, b) { return b.w - a.w; }).slice(0, 12);
    if (weak.length) {
      h += '<h3>假名薄弱项（错得最多）</h3><div class="chips">';
      weak.forEach(function (x) { h += '<span class="chip warn">' + esc(x.k) + ' 错' + x.w + '</span>'; });
      h += '</div>';
    }
    return h;
  }

  /* ---------- 13. 路由 ---------- */
  const VIEWS = {
    home: viewHome, kana: viewKana, learn: viewLearn, review: viewReview,
    vocab: viewLearn,   // 兼容旧链接 → 学新词
    grammar: viewGrammar,
    drill: viewDrill, dash: viewDash, wrong: viewWrong, custom: viewCustom,
    dict: viewDict, trans: viewTrans, read: viewRead
  };
  function render() {
    const r = (location.hash || "#/home").replace("#/", "");
    setStateFor(r === "review" ? "review" : "learn");   // 学习与复习各用各的状态
    const fn = VIEWS[r] || VIEWS.home;
    $("#app").innerHTML = fn();
    document.querySelectorAll(".nav a").forEach(function (a) {
      a.classList.toggle("on", a.getAttribute("href") === "#/" + r);
    });
    if (r === "kana") { nextKana(); renderKanaQ(); }
    if (r === "learn" || r === "review" || r === "vocab") {
      // 进入页面时重建队列（跨天、已刷完、队列为空都能拿到最新内容）；
      // 但评分/手动重建/切换范围触发的 render 不能重建，否则会覆盖刚设好的队列
      if (!queueJustSet) buildQueue(false);
      queueJustSet = false;
      renderCard();
    }
    if (r === "drill") renderDrill();
    if (r === "dict") { if (!dct.q) nextDict(); renderDict(); }
    if (r === "trans") { if (!trn.q) nextTrans(); renderTrans(); }
    if (r === "read") {
      if (readingTimer) { clearTimeout(readingTimer); readingTimer = null; }
      bindReadInput();
    }
    if (r === "dash") setTimeout(refreshCacheCount, 0);
    window.scrollTo(0, 0);
  }

  /* ---------- 14. 事件委托 ---------- */
  document.addEventListener("click", function (e) {
    const t = e.target;
    const A = function (n) { return t.getAttribute && t.getAttribute(n); };
    if (A("data-go")) {
      const to = A("data-go");
      // 已在目标页时 hash 不变、不会触发 hashchange，这里手动重建队列并刷新
      if (location.hash === "#/" + to) {
        setStateFor(to === "review" ? "review" : "learn");
        buildQueue(true); render();
      } else {
        location.hash = "#/" + to;
      }
      return;
    }
    if (A("data-kmode")) { kanaState.mode = A("data-kmode"); render(); return; }
    if (A("data-kscope")) { kanaState.scope = A("data-kscope"); nextKana(); render(); return; }
    if (A("data-kans")) { answerKana(A("data-kans")); return; }
    if (t.id === "kplay") { speak(kanaQ.ex); return; }
    if (t.id === "ktable") { showKanaTable(); return; }
    if (t.id === "kchart") { showChart(); return; }
    if (t.id === "wtrain") {
      const it = wrongItems();
      if (!it.length) { toast("错词本是空的"); return; }
      vs.queue = shuffle(it); vs.idx = 0; vs.show = false; location.hash = "#/vocab"; return;
    }
    if (t.id === "wclear") { if (confirm("清空错词本？")) { S.wrong = []; save(); render(); } return; }
    if (t.id === "exp") { exportData(); return; }
    if (t.id === "kconf") { showConfuse(); return; }
    if (A("data-vlv")) { vs.lv = A("data-vlv"); vs.lesson = 0; buildQueue(false); queueJustSet = true; render(); return; }
    if (A("data-vl")) { vs.lesson = parseInt(A("data-vl"), 10); buildQueue(false); queueJustSet = true; render(); return; }
    if (t.id === "vbuild" || t.id === "vbuild2") { buildQueue(true); queueJustSet = true; render(); return; }
    if (t.id === "vforce" || t.id === "vforce2") { buildQueue(true, true); queueJustSet = true; render(); return; }
    if (t.id === "vsay") { const v = vs.queue[vs.idx]; if (v) speak(v.k, { kanji: v.w, kana: v.k }); return; }
    if (t.id === "vshow") { vs.show = true; renderCard(); return; }
    if (A("data-g")) {
      const id = vs.queue[vs.idx].id, g = parseInt(A("data-g"), 10);
      review(id, g);
      if (g <= 1) pushWrong(id); else popWrong(id);
      bumpCombo(g >= 2); addXp(g >= 2 ? 10 : 2); syncBadges();
      vs.idx++; vs.show = false; queueJustSet = true; render(); return;
    }
    if (A("data-glv")) { gs.lv = A("data-glv"); render(); return; }
    if (A("data-gid")) {
      const id = A("data-gid"); const b = document.getElementById("gb-" + id);
      if (b) b.style.display = b.style.display === "none" ? "block" : "none";
      return;
    }
    const sayEl = t.getAttribute && t.getAttribute("data-say") ? t : (t.closest ? t.closest("[data-say]") : null);
    if (sayEl) { speak(sayEl.getAttribute("data-say")); return; }
    if (t.closest && t.closest(".gmark")) {
      const item = t.closest(".gitem"); const gi = item && item.querySelector(".ghead");
      if (gi) { const id = gi.getAttribute("data-gid"); if (S.grammar[id]) delete S.grammar[id]; else S.grammar[id] = 1; save(); render(); }
      return;
    }
    if (A("data-dk")) { ds.kind = A("data-dk"); ds.q = null; render(); return; }
    if (A("data-dlv")) { ds.lv = A("data-dlv"); ds.q = null; render(); return; }
    if (t.id === "dok") { checkDrill(); return; }
    if (t.id === "dnext") { nextDrill(); renderDrill(); return; }
    if (t.id === "dpass") { $("#dres").innerHTML = '<span class="no">答案：' + esc(ds.q.ans) + '</span>'; return; }
    if (t.id === "dtable") { showRuleTable(); return; }
    if (A("data-ctab")) { cst.tab = A("data-ctab"); render(); return; }
    if (t.id === "cadd") {
      const k = ($("#ck") || {}).value || "";
      const w = ($("#cw") || {}).value || "";
      const z = ($("#cz") || {}).value || "";
      const lv = ($("#clv") || {}).value || "N5";
      const p = ($("#cp") || {}).value || "名";
      const kana = k.trim().replace(/\s+/g, "");
      if (!kana) { toast("请填写假名读音"); return; }
      if (!z.trim()) { toast("请填写中文释义"); return; }
      const r = addCustom("vocab", { lv: lv, l: 0, k: kana, w: w.trim(), z: z.trim(), p: p });
      toast(r.ok ? "已添加：" + kana + (p.indexOf("动") === 0 ? "（基本形 " + masuToDict(kana) + "，已进变形训练）" : "") : r.msg);
      render(); return;
    }
    if (t.id === "caddg") {
      const n = ($("#cgn") || {}).value || "";
      const m = ($("#cgm") || {}).value || "";
      if (!n.trim()) { toast("请填写语法条目"); return; }
      if (!m.trim()) { toast("请填写意思"); return; }
      const r = addCustom("grammar", {
        lv: ($("#clv") || {}).value || "N5", l: 0, n: n.trim(),
        f: (($("#cgf") || {}).value || "").trim(), m: m.trim(),
        e: (($("#cge") || {}).value || "").trim(), t: (($("#cgt") || {}).value || "").trim()
      });
      toast(r.ok ? "已添加语法：" + n.trim() : r.msg);
      render(); return;
    }
    if (A("data-cdel")) {
      const id = A("data-cdel"), kind = A("data-ckind") || "vocab";
      S.custom[kind] = (S.custom[kind] || []).filter(function (x) { return x.id !== id; });
      rebuildAll(); save(); render(); return;
    }
    if (t.id === "cclear") {
      if (confirm("清空全部自定义单词？语法条目不受影响。")) { S.custom.vocab = []; rebuildAll(); save(); render(); }
      return;
    }
    if (t.id === "cexport") { exportCustom(); return; }
    if (t.id === "cbulkclear") { const el = $("#cbulk"); if (el) el.value = ""; $("#cpreview").innerHTML = ""; return; }
    if (t.id === "cbulkdo") { doBulkImport(); return; }
    if (A("data-dtlv")) { dct.lv = A("data-dtlv"); nextDict(); render(); return; }
    if (A("data-dtscope")) { dct.scope = A("data-dtscope"); nextDict(); render(); return; }
    if (t.id === "dctplay") { playWord(dct.q); return; }
    if (t.id === "dctslow") { playWord(dct.q, true); return; }
    if (t.id === "dctshow") {
      if (!dct.q || dct.revealed) return;   // 已揭示过就不再重复（原先会一直往下追加答案）
      dct.revealed = true; dct.w++;
      const res = $("#dctres");
      if (res) res.innerHTML = '<span class="no">答案：' + esc(dct.q.w || dct.q.k) + '（' + esc(dct.q.k) + '）</span><div class="tip">' + esc(dct.q.z) + '　' + esc(dct.q.p || '') + '</div>';
      insertAnswer(dct.q);
      return;
    }
    if (t.id === "dctok") { checkDict(); return; }
    if (t.id === "dctnext") { nextDict(); render(); return; }

    if (A("data-trlv")) { trn.lv = A("data-trlv"); nextTrans(); render(); return; }
    if (A("data-trdir")) { trn.dir = A("data-trdir"); nextTrans(); render(); return; }
    if (A("data-tropt")) {
      if (!trn.q || trn.picked >= 0) return;
      const sel = A("data-tropt");
      trn.picked = trn.opts.indexOf(sel);
      const ok = sel === trn.q.z;
      trn.r += ok ? 1 : 0; trn.w += ok ? 0 : 1;
      if (!ok) pushWrong(trn.q.id); else popWrong(trn.q.id);
      save(); act(); renderTrans(); return;
    }
    if (t.id === "trsay") { playWord(trn.q); return; }
    if (t.id === "trok") {
      if (!trn.q) return;
      const inp = $("#trin"); if (!inp) return;
      const ok = matchWord(trn.q, inp.value);
      trn.r += ok ? 1 : 0; trn.w += ok ? 0 : 1;
      if (!ok) pushWrong(trn.q.id); else popWrong(trn.q.id);
      save(); act();
      const res = $("#trres");
      if (res) res.innerHTML = '<span class="' + (ok ? "ok" : "no") + '">' + (ok ? "✓ 正确" : "✗ 正确：" + esc(trn.q.w || trn.q.k) + "（" + esc(trn.q.k) + "）") + '</span><div class="tip">' + esc(trn.q.z) + '</div>';
      return;
    }
    if (t.id === "trshow") {
      if (!trn.q) return;
      const res = $("#trres");
      if (res) res.innerHTML = '<span class="no">答案：' + esc(trn.q.w || trn.q.k) + '（' + esc(trn.q.k) + '）</span>';
      return;
    }
    if (t.id === "trnext") { nextTrans(); render(); return; }

    if (A("data-rdlv")) { rd.lv = A("data-rdlv"); render(); return; }
    if (A("data-rdopen")) {
      const id = A("data-rdopen");
      rd.cur = READING.filter(function (a) { return a.id === id; })[0] || null;
      rd.stage = "read"; rd.bi = 0; rd.br = 0; rd.bw = 0; rd.qi = 0; rd.qr = 0; rd.qw = 0; rd.pick = -1; rd.rev = false;
      render(); return;
    }
    if (A("data-rdback")) { rd.cur = null; render(); return; }
    if (A("data-rdstage")) {
      rd.stage = A("data-rdstage");
      if (rd.stage === "blank") { rd.bi = 0; rd.br = 0; rd.bw = 0; rd.rev = false; }
      if (rd.stage === "quiz") { rd.qi = 0; rd.qr = 0; rd.qw = 0; rd.pick = -1; }
      render(); return;
    }
    if (t.id === "rdk") { rd.showK = !rd.showK; render(); return; }
    if (t.id === "rdz") { rd.showZ = !rd.showZ; render(); return; }
    if (A("data-rsay")) { if (rd.cur) saySentence(rd.cur, parseInt(A("data-rsay"), 10)); return; }
    if (t.id === "rdplayall") { if (rd.cur) playAll(rd.cur); return; }
    if (t.id === "rdplaycur") {
      if (rd.cur) { const bs = blanksOf(rd.cur); saySentence(rd.cur, bs[rd.bi]); }
      return;
    }
    if (t.id === "rdrestart") {
      rd.stage = "read"; rd.bi = 0; rd.br = 0; rd.bw = 0; rd.rev = false;
      rd.qi = 0; rd.qr = 0; rd.qw = 0; rd.pick = -1; render(); return;
    }
    if (t.id === "rdok") {
      if (!rd.cur) return;
      const inp = $("#rdin"); if (!inp) return;
      const bs = blanksOf(rd.cur), s = rd.cur.s[bs[rd.bi]];
      const ok = matchBlank(s.b, inp.value);
      rd.br += ok ? 1 : 0; rd.bw += ok ? 0 : 1; rd.rev = true;
      const res = $("#rdres");
      if (res) {
        res.innerHTML = '<span class="' + (ok ? "ok" : "no") + '">'
          + (ok ? "✓ 正确" : "✗ 正确答案：" + esc(s.b.a)) + '</span>'
          + '<div class="tip">' + esc(s.j) + '<br>' + esc(s.z) + (s.g ? '<br>语法：' + esc(s.g) : '') + '</div>'
          + '<button class="btn" id="rdblanknext">下一空</button>';
      }
      return;
    }
    if (t.id === "rdblanknext" || t.id === "rdskip") {
      rd.bi++; rd.rev = false; render(); return;
    }
    if (t.id === "rdshow") {
      if (!rd.cur) return;
      const bs = blanksOf(rd.cur), s = rd.cur.s[bs[rd.bi]];
      rd.bw++; rd.rev = true;
      const res = $("#rdres");
      if (res) {
        res.innerHTML = '<span class="no">答案：' + esc(s.b.a) + '（' + esc(s.b.k) + '）</span>'
          + '<div class="tip">' + esc(s.j) + '<br>' + esc(s.z) + (s.g ? '<br>语法：' + esc(s.g) : '') + '</div>'
          + '<button class="btn" id="rdblanknext">下一空</button>';
      }
      return;
    }
    if (A("data-rdopt")) {
      if (!rd.cur || rd.pick >= 0) return;
      const i = parseInt(A("data-rdopt"), 10);
      const q = rd.cur.q[rd.qi];
      rd.pick = i;
      if (i === q.a) { rd.qr++; addXp(5); } else rd.qw++;
      act(); render(); return;
    }
    if (t.id === "rdnextq") { rd.qi++; rd.pick = -1; render(); return; }

    if (t.id === "checkin") { doCheckin(); return; }
    if (t.id === "setgoal") {
      const g = prompt("目标等级（N5/N4/N3/N2/N1）", S.settings.goal);
      if (g && LEVELS.indexOf(g) >= 0) { S.settings.goal = g; save(); render(); }
      return;
    }
    if (t.id === "setnew") {
      const n = prompt("每日新词数量", String(S.settings.newPerDay));
      const v = parseInt(n, 10); if (v > 0 && v < 500) { S.settings.newPerDay = v; save(); render(); }
      return;
    }
    if (A("data-amode")) { S.settings.audioMode = A("data-amode"); save(); render(); return; }
    if (t.id === "vrefresh") { loadVoices(); const n = voiceList().length; toast(n ? "已刷新，共 " + n + " 个日语语音" : "未检测到日语语音，请检查系统语言包"); render(); return; }
    if (t.id === "audiotest") { tts("こんにちは、元気ですか。"); return; }
    if (t.id === "audiotest2") {
      speak("日本語", { kanji: "日本語", kana: "にほんご" });
      return;
    }
    if (t.id === "cwarm") { startWarm([S.settings.goal]); return; }
    if (t.id === "cwarmn5") { startWarm(["N5"]); return; }
    if (t.id === "cwarmall") { startWarm(LEVELS); return; }
    if (t.id === "cclearcache") {
      clearAudioCache().then(function (n) {
        toast("已清空 " + n + " 个缓存音频");
        refreshCacheCount();
      });
      return;
    }
    if (t.id === "reset") {
      if (confirm("确定清空全部学习进度？此操作不可恢复。")) {
        const keep = { vocab: S.custom.vocab.slice(), grammar: S.custom.grammar.slice() };
        S = JSON.parse(JSON.stringify(DEF));
        if (keep.vocab.length || keep.grammar.length) {
          if (confirm("检测到你有 " + keep.vocab.length + " 个自定义单词、" + keep.grammar.length + " 条自定义语法。\n\n点「确定」保留我的词库，点「取消」连同词库一起清空。")) {
            S.custom = keep;
          }
        }
        rebuildAll(); save(); render();
      }
      return;
    }
  });
  document.addEventListener("input", function (e) {
    if (e.target.id === "gsearch") {
      gs.q = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const el = $("#gsearch"); if (el) { el.focus(); el.setSelectionRange(pos, pos); }
      return;
    }
    if (e.target.id === "ttsrate") {
      S.settings.ttsRate = parseFloat(e.target.value);
      const lab = document.getElementById("ttsrateval"); if (lab) lab.textContent = e.target.value;
      save(); return;
    }
    if (e.target.id === "humanrate") {
      S.settings.humanRate = parseFloat(e.target.value);
      const lab = document.getElementById("humanrateval"); if (lab) lab.textContent = e.target.value;
      save(); return;
    }
    if (e.target.id === "csearch") {
      cst.q = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const el = $("#csearch");
      if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (err) {} }
      return;
    }
  });
  document.addEventListener("change", function (e) {
    if (e.target.id === "impf" && e.target.files && e.target.files[0]) importData(e.target.files[0]);
    if (e.target.id === "voicesel") { S.settings.voiceURI = e.target.value; save(); tts("こんにちは"); return; }
    if (e.target.id === "clv") { cst.lv = e.target.value; return; }
    if (e.target.id === "cp") { cst.p = e.target.value; return; }
  });

  /* ---------- 14b. 键盘快捷键 ---------- */
  document.addEventListener("keydown", function (e) {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    const r = (location.hash || "#/home").replace("#/", "");
    const k = e.key;
    if (r === "kana" && kanaQ) {
      if (k >= "1" && k <= "4") {
        const b = document.querySelectorAll("#kq .opt")[parseInt(k, 10) - 1];
        if (b) b.click();
      } else if (k === "Enter") { nextKana(); renderKanaQ(); }
      else if (k === "s" || k === "S") { speak(kanaQ.ex || kanaQ.ans || ""); }
    } else if (r === "learn" || r === "review" || r === "vocab") {
      if (k === " ") { e.preventDefault(); if (vs.idx < vs.queue.length) { vs.show = !vs.show; renderCard(); } }
      else if (k >= "1" && k <= "4") {
        const b = document.querySelector('#vcard .g[data-g="' + (parseInt(k, 10) - 1) + '"]');
        if (b) b.click();
        else if (vs.idx < vs.queue.length) { vs.show = true; renderCard(); }
      } else if (k === "s" || k === "S") { const v = vs.queue[vs.idx]; if (v) speak(v.k, { kanji: v.w, kana: v.k }); }
    } else if (r === "drill") {
      if (k === "Enter") { const b = document.getElementById("dok") || document.getElementById("dnext"); if (b) b.click(); }
    }
  });

  /* ---------- 14c. 进度备份：导出 / 导入 ---------- */
  function exportData() {
    try {
      const blob = new Blob([JSON.stringify(S)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "日语学习站-进度-" + today() + ".json";
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      toast("已导出进度备份（换设备可在仪表盘导入）");
    } catch (e) { toast("导出失败：" + e.message); }
  }
  function importData(file) {
    const r = new FileReader();
    r.onload = function () {
      try {
        const o = JSON.parse(r.result);
        if (!o || !o.cards) throw new Error("bad");
        S = Object.assign(JSON.parse(JSON.stringify(DEF)), o);
        rebuildAll(); save(); render(); toast("进度已恢复");
      } catch (e) { toast("文件格式不正确"); }
    };
    r.readAsText(file);
  }
  function refreshCacheCount() {
    const el = $("#cacnt"); if (!el) return;
    cachedCount().then(function (n) { el.textContent = n ? "已缓存 " + n + " 个" : "尚未缓存"; });
  }
  function startWarm(levels) {
    if (warmState.running) { toast("正在缓存中：" + warmState.done + "/" + warmState.total); return; }
    let i = 0;
    const next = function () {
      if (i >= levels.length) { toast("真人音缓存完成"); refreshCacheCount(); return; }
      const lv = levels[i++];
      toast("开始缓存 " + lv + " 真人音…");
      warmLevel(lv, function (st) {
        const el = $("#cacnt");
        if (el) el.textContent = "缓存中 " + st.done + "/" + st.total;
      }).then(function (st) {
        toast(lv + "：新增 " + st.ok + " 个" + (st.total - st.ok ? "，失败 " + (st.total - st.ok) + " 个" : ""));
        next();
      });
    };
    next();
  }
  function exportCustom() {
    try {
      const data = { vocab: customVocab(), grammar: customGrammar(), exportAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "我的词库-" + today() + ".json";
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      toast("已导出 " + data.vocab.length + " 词 / " + data.grammar.length + " 条语法");
    } catch (e) { toast("导出失败：" + e.message); }
  }
  function parseBulkLine(line) {
    let p = line.split("\t").map(function (s) { return s.trim(); }).filter(Boolean);
    if (p.length < 2) p = line.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (p.length < 2) p = line.split(/\s+/).map(function (s) { return s.trim(); }).filter(Boolean);
    return p;
  }
  function doBulkImport() {
    const el = $("#cbulk"); if (!el) return;
    const raw = el.value.trim();
    const box = $("#cpreview");
    if (!raw) { toast("请先粘贴内容"); return; }
    let items = [];
    // JSON 模式
    if (raw.charAt(0) === "[" || raw.charAt(0) === "{") {
      try {
        const o = JSON.parse(raw);
        const arr = Array.isArray(o) ? o : (o.vocab || []);
        items = arr.map(function (x) {
          return { lv: x.lv || ($("#clv") || {}).value || "N5", l: 0, k: (x.k || "").trim(), w: (x.w || "").trim(), z: (x.z || "").trim(), p: x.p || "名" };
        }).filter(function (x) { return x.k && x.z; });
      } catch (e) { if (box) box.innerHTML = '<p class="tip">JSON 解析失败：' + esc(e.message) + '</p>'; return; }
    } else {
      const lv = ($("#clv") || {}).value || "N5";
      raw.split(/\r?\n/).forEach(function (line) {
        if (!line.trim() || /^#/.test(line.trim())) return;
        const p = parseBulkLine(line);
        if (!p.length || !p[0]) return;
        const k = p[0].replace(/\s+/g, "");
        let w = "", z = "", pt = "名";
        if (p.length === 2) { z = p[1]; }
        else if (p.length === 3) { w = p[1]; z = p[2]; }
        else { w = p[1]; z = p[2]; pt = p[3]; }
        if (PARTS.indexOf(pt) < 0) pt = "名";
        if (k && z) items.push({ lv: lv, l: 0, k: k, w: w, z: z, p: pt });
      });
    }
    if (!items.length) { if (box) box.innerHTML = '<p class="tip">没有解析出有效条目，请检查格式。</p>'; return; }
    let added = 0, dup = 0;
    items.forEach(function (it) { const r = addCustom("vocab", it); if (r.ok) added++; else dup++; });
    if (box) {
      box.innerHTML = '<p class="tip">解析 ' + items.length + ' 条，新增 <b>' + added + '</b> 条' + (dup ? '，跳过重复 ' + dup + ' 条' : '') + '。</p>';
    }
    toast("导入完成：新增 " + added + " 条" + (dup ? "，重复 " + dup + " 条" : ""));
    if (el) el.value = "";
    render();
  }

  /* ---------- 14d. 五十音图 ---------- */
  function showChart() {
    let h = '<h3>五十音图（点击发音）</h3><div class="kgrid">';
    KANA.filter(function (k) { return k[6] === "清"; }).forEach(function (k) {
      h += '<div class="kcell" data-say="' + esc(k[4]) + '"><div class="h">' + k[0] + '</div><div class="k">' + k[1] + '</div><div class="r">' + k[2] + '</div></div>';
    });
    h += '</div><div class="tip">浊音、拗音请用上方「范围」筛选练习，或看字源速查表。</div>';
    $("#kextra").innerHTML = h;
  }

  function doCheckin() {
    const t = today();
    if (S.checkin.days.indexOf(t) < 0) {
      S.checkin.days.push(t);
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yk = y.getFullYear() + "-" + String(y.getMonth() + 1).padStart(2, "0") + "-" + String(y.getDate()).padStart(2, "0");
      S.checkin.streak = (S.checkin.last === yk ? (S.checkin.streak || 0) : 0) + 1;
      S.checkin.last = t;
      save(); act(5); render();
    }
  }
  function showKanaTable() {
    let h = '<h3>字源速查表</h3><table class="tbl"><tr><th>平</th><th>片</th><th>罗马字</th><th>字源</th><th>例词</th><th>中文</th></tr>';
    KANA.forEach(function (k) {
      h += '<tr><td class="big">' + k[0] + '</td><td class="big">' + k[1] + '</td><td>' + k[2] + '</td><td>' + (k[3] || "—") + '</td><td>' + esc(k[4]) + '</td><td>' + esc(k[5]) + '</td></tr>';
    });
    h += '</table>';
    $("#kextra").innerHTML = h;
  }
  function showConfuse() {
    let h = '<h3>九组易混对</h3><div class="cfgrid">';
    CONFUSE.forEach(function (c) {
      h += '<div class="cf"><div class="cfk"><span>' + c[0] + '</span><span>' + c[1] + '</span></div>';
      h += '<div class="cfd">' + esc(c[2]) + '</div>';
      h += '<div class="cfw">' + esc(c[3]) + '（' + esc(c[5]) + '）／' + esc(c[4]) + '（' + esc(c[6]) + '）</div></div>';
    });
    h += '</div>';
    $("#kextra").innerHTML = h;
  }
  function showRuleTable() {
    let h = '<h3>变形规则速查</h3>';
    h += '<table class="tbl"><tr><th>形</th><th>一类（五段）</th><th>二类（一段）</th><th>三类</th></tr>';
    const rows = [
      ["ます形", "う段→い段＋ます", "去る＋ます", "する→します／来る→きます"],
      ["て形", "く→いて ぐ→いで す→して つ/る/う→って ぬ/ぶ/む→んで", "去る＋て", "して／きて"],
      ["た形", "て形のて→た、で→だ", "去る＋た", "した／きた"],
      ["ない形", "う段→あ段＋ない（う→わない）", "去る＋ない", "しない／こない"],
      ["基本形", "原形", "原形", "する／来る"],
      ["可能形", "う段→え段＋る", "去る＋られる", "できる／こられる"],
      ["意志形", "う段→お段＋う", "去る＋よう", "しよう／こよう"],
      ["ば形", "う段→え段＋ば", "去る＋れば", "すれば／くれば"],
      ["受身形", "う段→あ段＋れる", "去る＋られる", "される／こられる"],
      ["使役形", "う段→あ段＋せる", "去る＋させる", "させる／こさせる"],
      ["命令形", "う段→え段", "去る＋ろ", "しろ／こい"]
    ];
    rows.forEach(function (r) { h += '<tr><td><b>' + r[0] + '</b></td><td>' + r[1] + '</td><td>' + r[2] + '</td><td>' + r[3] + '</td></tr>'; });
    h += '</table>';
    h += '<h3>形容词变形</h3><table class="tbl"><tr><th>形</th><th>い形容词（高い）</th><th>な形容词（静か）</th></tr>';
    h += '<tr><td>て形</td><td>高くて</td><td>静かで</td></tr>';
    h += '<tr><td>た形</td><td>高かった</td><td>静かだった</td></tr>';
    h += '<tr><td>ない形</td><td>高くない</td><td>静かではない</td></tr>';
    h += '<tr><td>过去否定</td><td>高くなかった</td><td>静かではなかった</td></tr>';
    h += '<tr><td>副词化</td><td>高く</td><td>静かに</td></tr>';
    h += '<tr><td>ば形</td><td>高ければ</td><td>静かなら（ば）</td></tr>';
    h += '<tr><td>连体形</td><td>高い</td><td>静かな</td></tr></table>';
    $("#dextra").innerHTML = h;
  }

  /* ---------- 15. 启动 ---------- */
  rollDay();
  rebuildAll();
  globalThis.__JP__ = { conj: conj, conjAdj: conjAdj, get VOCAB() { return VOCAB; }, get VERBS() { return VERBS; }, ADJS: ADJS, get GRAMMAR() { return GRAMMAR; }, KANA: KANA, state: function () { return S; }, hasHuman: hasHuman, humanCandidates: humanCandidates, bestVoiceName: function () { const v = bestVoice(); return v ? v.name : null; }, rebuildAll: rebuildAll, addCustom: addCustom, masuToDict: masuToDict, playHuman: playHuman, tts: tts, speak: speak, normAns: normAns, matchWord: matchWord, drillPool: drillPool, buildQueue: buildQueue, queueNote: queueNote, get rd() { return rd; }, READING: READING, blanksOf: blanksOf, matchBlank: matchBlank, viewRead: viewRead, readListHTML: readListHTML, blankStageHTML: blankStageHTML, quizStageHTML: quizStageHTML, doneHTML: doneHTML, nextDueInfo: nextDueInfo, fmtWhen: fmtWhen, insertAnswer: insertAnswer, answerHTML: answerHTML, checkDict: checkDict, nextDict: nextDict, nextTrans: nextTrans, get vs() { return vs; }, get ls() { return ls; }, get rs() { return rs; }, setStateFor: setStateFor, viewLearn: viewLearn, viewReview: viewReview, get dct() { return dct; }, get trn() { return trn; }, isCached: isCached, warmAudio: warmAudio, cachedCount: cachedCount, clearAudioCache: clearAudioCache, resetJaWarn: function () { NO_JA_WARNED = false; } };
  window.addEventListener("hashchange", render);
  render();
  syncBadges();
  try {
    if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) navigator.serviceWorker.register("sw.js").catch(function () {});
  } catch (e) {}
})();
