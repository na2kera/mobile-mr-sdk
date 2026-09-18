// src/core/profile.ts（端末ごとの較正値の保存）の回帰テスト。`npm test` で実行する。
// 検証しているもの / していないもの:
//   - 検証済み: URL 指定 > 保存値 > fallback の優先、範囲外の扱い、reset、namespace、storage が無い / throw する環境
//   - 未検証（仮定）: 実 localStorage の容量・private モードの挙動（Map で代用）
import { test } from "node:test";
import assert from "node:assert/strict";
import { createProfile } from "../../dist/core/index.js";

const p = (q) => new URLSearchParams(q);

function mapStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    map: m,
  };
}

test("read: URL 指定 > 保存値 > fallback。URL の値は保存される", () => {
  const storage = mapStorage();
  const profile = createProfile("mr", storage);
  assert.equal(profile.read(p(""), "handScale", 1), 1);
  assert.equal(profile.read(p("handScale=2.1"), "handScale", 1), 2.1);
  assert.equal(storage.map.get("mr:handScale"), "2.1");
  assert.equal(profile.read(p(""), "handScale", 1), 2.1, "次回は URL 無しでも保存値");
  assert.equal(profile.read(p("handScale=abc"), "handScale", 1), 2.1, "壊れた URL 値は無視して保存値");
});

test("read: 範囲外の URL 値は保存しない。保存値が範囲外なら fallback。reset で消える", () => {
  const storage = mapStorage();
  const profile = createProfile("mr", storage);
  assert.equal(profile.read(p("fov=500"), "fov", 70, { max: 180 }), 70);
  assert.equal(storage.map.has("mr:fov"), false);
  profile.set("fov", 500);
  assert.equal(profile.read(p(""), "fov", 70, { max: 180 }), 70);
  profile.set("fov", 94);
  assert.equal(profile.read(p("fov=reset"), "fov", 70), 70);
  assert.equal(profile.get("fov"), undefined);
});

test("namespace で分かれる。壊れた保存値は undefined", () => {
  const storage = mapStorage();
  const a = createProfile("a", storage);
  const b = createProfile("b", storage);
  a.set("x", 1);
  assert.equal(b.get("x"), undefined);
  storage.map.set("a:y", "not a number");
  assert.equal(a.get("y"), undefined);
});

test("storage が無い / throw する環境でも落ちない", () => {
  const none = createProfile("mr", undefined);
  none.set("x", 1);
  assert.equal(none.get("x"), undefined);
  assert.equal(none.read(p("x=3"), "x", 1), 3);

  const broken = createProfile("mr", {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  });
  assert.equal(broken.read(p(""), "x", 1), 1);
  assert.equal(broken.read(p("x=2"), "x", 1), 2);
  assert.equal(broken.read(p("x=reset"), "x", 1), 1);
});
