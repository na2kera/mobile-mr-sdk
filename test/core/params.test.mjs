// src/core/params.ts（URL パラメータの読み取りと名前の登録）の回帰テスト。`npm test` で実行する。
// 検証しているもの: readNumber の既定 min（0 を弾く）と範囲、readResolution の形式、readFlag の表記、登録の衝突検出
import { test } from "node:test";
import assert from "node:assert/strict";
import { readNumber, readResolution, readFlag, createParamRegistry } from "../../dist/core/index.js";

const p = (q) => new URLSearchParams(q);

test("readNumber: 未指定・非数・範囲外は fallback。既定の min は 0 を弾く", () => {
  assert.equal(readNumber(p(""), "fov", 70), 70);
  assert.equal(readNumber(p("fov=abc"), "fov", 70), 70);
  assert.equal(readNumber(p("fov=94.5"), "fov", 70), 94.5);
  assert.equal(readNumber(p("fov=0"), "fov", 70), 70, "0 は既定で弾く");
  assert.equal(readNumber(p("fov=0"), "fov", 70, { min: 0 }), 0, "min:0 を明示すれば通る");
  assert.equal(readNumber(p("fov=200"), "fov", 70, { max: 180 }), 70);
  assert.equal(readNumber(p("fov=-5"), "fov", 70, { min: -10 }), -5);
});

test("readResolution: WxH（大文字 X も可）。壊れていれば fallback", () => {
  assert.deepEqual(readResolution(p("camRes=1920x1080"), "camRes", [1280, 720]), [1920, 1080]);
  assert.deepEqual(readResolution(p("camRes=1920X1080"), "camRes", [1280, 720]), [1920, 1080]);
  assert.deepEqual(readResolution(p("camRes=1920"), "camRes", [1280, 720]), [1280, 720]);
  assert.deepEqual(readResolution(p("camRes=0x720"), "camRes", [1280, 720]), [1280, 720]);
  assert.deepEqual(readResolution(p(""), "camRes", [1280, 720]), [1280, 720]);
});

test("readFlag: ?name と ?name=1 は true、=0 / false / off は false、未指定は fallback", () => {
  assert.equal(readFlag(p("autostart"), "autostart"), true);
  assert.equal(readFlag(p("autostart=1"), "autostart"), true);
  assert.equal(readFlag(p("gravityAlign=0"), "gravityAlign", true), false);
  assert.equal(readFlag(p("gravityAlign=false"), "gravityAlign", true), false);
  assert.equal(readFlag(p("gravityAlign=OFF"), "gravityAlign", true), false);
  assert.equal(readFlag(p(""), "gravityAlign", true), true);
  assert.equal(readFlag(p(""), "gravityAlign"), false);
});

test("registry: 別 owner の同名は throw、同 owner の再登録は可", () => {
  const reg = createParamRegistry();
  reg.declare("hands", ["detW", "smooth"]);
  reg.declare("hands", ["detW"]);
  assert.throws(() => reg.declare("marker", ["detW"]), /"detW"/);
  reg.declare("marker", ["markerMm"]);
  assert.equal(reg.ownerOf("markerMm"), "marker");
  assert.equal(reg.ownerOf("nope"), undefined);
  assert.deepEqual(reg.names().sort(), ["detW", "markerMm", "smooth"]);
});
