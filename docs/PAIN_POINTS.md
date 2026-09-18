# Pain Points（SDK 側の痛点ログ）

段階 3 の置き換え（mobile-mr のデモを SDK で書き直す作業）で見つかった **API の使いにくさ**を記録する。
形式は mobile-mr の `docs/PAIN_POINTS.md`（pain-point スキル）と同じ。新しいものは末尾に追記する。

---

## [2026-09-12] core / 01-stereo-box: "pending" と "skipped" を利用側の HUD で毎回除外する必要がある

- **何が苦しかったか**: `SessionState` の各項目が `"pending" | "skipped" | ...` を持つため、HUD に「まだ / 該当なし」を出さないためには利用側が `permission === "pending" || permission === "skipped"` を項目ごとに書く。PC 経路で `sensor=skipped fs=skipped` が出てヘッドレス Chrome の確認に 1 回落ちた
- **どう対処したか**: 01 の `renderHud` で項目ごとに除外
- **SDK の API をどう変えるか（案）**: 「表示する価値のある状態か」を SDK が判定する補助（`describe(state): string[]` のような HUD 用の整形、または `isSettled(value)`）を core に持つ。HUD の文字列そのものは利用側が決めるので、判定だけ提供する
- **関連**: `src/core/session.ts:23`（`SensorState`）、`../mobile-mr/demos/01-stereo-box/main.ts:129`（`renderHud`）

## [2026-09-12] core / 01-stereo-box: 「全画面が実際に切り替わった」を知るのに利用側で前回の値を覚える必要がある

- **何が苦しかったか**: 置き換え前の HUD は `fs-change: enter / exit` を「fullscreenchange が起きた後だけ」出していた。`change` イベントは全項目の更新で発火するので、利用側が `lastInFullscreen` を持って `inFullscreen` の変化を検出することになった
- **どう対処したか**: 01 に `lastInFullscreen` を置いて差分検出
- **SDK の API をどう変えるか（案）**: `session.on("fullscreen", inFullscreen => ...)` のような項目別のイベントを持つ（`sensor` と同じ扱い）。`change` は「何かが変わった」の粗い通知として残す
- **関連**: `src/core/session.ts:173`（`onFullscreenChange`）、`../mobile-mr/demos/01-stereo-box/main.ts:169`（`lastInFullscreen`）
