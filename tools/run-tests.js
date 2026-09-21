#!/usr/bin/env node
/* 跑全部回归测试：node tools/run-tests.js  [最小版本号]
 * 测试脚本放在 tools/tests/ 而不是系统 temp —— temp 会被清理（v4-v9 就这样丢过一次）。
 * 每个脚本都必须在项目根目录下运行（脚本内用相对路径读 js/data/*.js）。
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const TDIR = path.join(__dirname, "tests");
const from = parseInt(process.argv[2] || "0", 10);

const files = fs.readdirSync(TDIR)
  .filter((f) => /^jp_v(\d+)_verify\.js$/.test(f))
  .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10))
  .filter((f) => parseInt(f.match(/\d+/)[0], 10) >= from);

if (!files.length) { console.log("没有找到测试脚本"); process.exit(1); }

let totalPass = 0, totalFail = 0, broken = [];
files.forEach((f) => {
  const n = f.match(/\d+/)[0];
  let out = "";
  try {
    out = execFileSync(process.execPath, [path.join(TDIR, f)], { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    out = (e.stdout || "") + (e.stderr || "");
  }
  // 兼容三种输出格式：74/74 通过 ｜ 43 通过 / 0 失败 ｜ 36/37 通过，1 失败
  let p = 0, q = 0, ok = true;
  const a = out.match(/结果：(\d+)\/(\d+) 通过/);
  const b = out.match(/结果：(\d+) 通过 \/ (\d+) 失败/);
  const c = out.match(/结果：(\d+)\/(\d+) 通过，(\d+) 失败/);
  if (c) { p = parseInt(c[1], 10); q = parseInt(c[2], 10); ok = parseInt(c[3], 10) === 0; }
  else if (a) { p = parseInt(a[1], 10); q = parseInt(a[2], 10); ok = p === q; }
  else if (b) { p = parseInt(b[1], 10); q = p + parseInt(b[2], 10); ok = parseInt(b[2], 10) === 0; }
  else { ok = false; broken.push(f); }
  totalPass += p; totalFail += (q - p);
  console.log("v" + String(n).padEnd(3) + (ok ? " ✓ " : " ✗ ") + p + "/" + q);
  if (!ok && !broken.includes(f)) {
    const lines = out.split("\n").filter((L) => L.indexOf("✗") >= 0).slice(0, 6);
    lines.forEach((L) => console.log("      " + L.trim()));
  }
});

console.log("\n合计 " + files.length + " 个测试脚本：" + totalPass + " 通过 / " + totalFail + " 失败");
if (broken.length) console.log("异常（无法解析输出）：" + broken.join(", "));
process.exitCode = (totalFail || broken.length) ? 1 : 0;
