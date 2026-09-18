// src/core/loop.ts（例外を隔離するフレームループ）の回帰テスト。`npm test` で実行する。
// 検証しているもの / していないもの:
//   - 検証済み: 登録順の呼び出し、dt と統計、1 つが throw しても他が動き続けること、同じ失敗の通知が 1 回にまとまること、remove / 二重 start
//   - 未検証（仮定）: requestAnimationFrame の実時間（フェイクの env.frame で進める）
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoop } from "../../dist/core/index.js";
import { fakeEnv } from "./fake-env.mjs";

test("登録順に呼び、dt と統計を出す", () => {
  const env = fakeEnv();
  const loop = createLoop(env, () => {});
  const order = [];
  loop.add("a", (dt) => order.push(["a", dt]));
  loop.add("b", (dt) => order.push(["b", dt]));
  loop.start();
  assert.equal(loop.running, true);
  env.frame(16);
  env.frame(20);
  assert.deepEqual(order, [
    ["a", 0],
    ["b", 0],
    ["a", 20],
    ["b", 20],
  ]);
  assert.equal(loop.stats.frames, 2);
  assert.equal(loop.stats.lastDtMs, 20);
  loop.stop();
  assert.equal(loop.running, false);
  assert.equal(env.pendingFrames, 0);
});

test("1 つが throw しても他は動き続け、エラーは内容が変わったときだけ通知される", () => {
  const env = fakeEnv();
  const errors = [];
  const loop = createLoop(env, (e) => errors.push(`${e.name}:${e.text}`));
  let bCalls = 0;
  let fail = true;
  loop.add("a", () => {
    if (fail) throw new Error("infer failed");
  });
  loop.add("b", () => bCalls++);
  loop.start();
  env.frame();
  env.frame();
  env.frame();
  assert.equal(bCalls, 3);
  assert.deepEqual(errors, ["a:Error: infer failed"]);
  assert.equal(loop.stats.errors.a, "Error: infer failed");
  fail = false;
  env.frame();
  assert.equal(loop.stats.errors.a, undefined, "成功したら消える");
  fail = true;
  env.frame();
  assert.equal(errors.length, 2, "消えたあと再び失敗したら通知する");
});

test("remove で外れる。同名 add は置き換え。start の二重呼びは無害", () => {
  const env = fakeEnv();
  const loop = createLoop(env, () => {});
  let calls = 0;
  loop.add("a", () => calls++);
  loop.add("a", () => (calls += 10));
  loop.start();
  loop.start();
  env.frame();
  assert.equal(calls, 10);
  assert.equal(env.pendingFrames, 1);
  loop.remove("a");
  env.frame();
  assert.equal(calls, 10);
});
