---
name: pc-check
description: SDK の変更を PC で自動確認する。「テスト書いて」「PC で確認して」「ヘッドレスで回して」と言われたとき、またはモジュールの実装後・報告前に使う。経路は 2 つ — Node の `node --test`（tsc で出した dist/ を対象、追加依存ゼロ）と、フェイク入力 + ヘッドレス Chrome（CDP を直接叩く。mobile-mr の scripts/headless-*.mjs と同じ形）。PASS / FAIL を出力ごと報告し、FAIL のまま「完了」と言わない。
---

# PC で確認する

実機（iPhone + ゴーグル）でしか最終確認できないものが多いからこそ、**PC で確認できる範囲を SDK 自身が持つ**（フェイクカメラ・合成の手・体・姿勢の注入口は SDK の正式な API。new-module スキル手順 4）。
形は mobile-mr の `scripts/test-*.mjs` / `headless-*.mjs` に合わせる（段階3 でそのまま並べて回せるように）。

| 経路 | 対象 | 置き場 | 実行 |
| --- | --- | --- | --- |
| Node テスト | Three.js 非依存の数学・ルール・プロトコル（各モジュールの大半） | `test/<module>/<topic>.test.mjs` | `npm test`（= `tsc` → `node --test test/`） |
| ヘッドレス Chrome | ブラウザ API を通る経路（開始フロー、getUserMedia のフェイク、DeviceOrientation、全画面、Wake Lock、ws） | `scripts/headless-<topic>.mjs` | `npm run check:<topic>` |

## 前提: Node のバージョン

```bash
node -v   # 22.18 以上（mobile-mr の engines と同じ）
```

このマシンの既定シェルでは 20.x が出ることがある。22 未満だと組み込み WebSocket（ヘッドレス Chrome の CDP に使う）と `.ts` の型消去 import が無い。バージョン管理ツール側で切り替えてから回す。

## Node テスト（`node --test`）

- テストフレームワークを足さない。`node:test` + `node:assert/strict` だけ。理由: 依存追加はスタック変更（相談が要る）で、対象の大半は純粋な数学
- **`dist/` を import する**（`../../dist/<module>/x.js`）。利用側が受け取るものと同じ成果物をテストするため。mobile-mr は `.ts` を Node の型消去で直接 import しているが、SDK は tsc の出力を対象にする（CLAUDE.md の決定）。したがって `npm test` は必ず `tsc` を先に走らせる
- ファイル先頭に**「検証しているもの / していないもの」**を書く（mobile-mr の `test-hand-math.mjs` の流儀）。「していないもの」= 実機でしか確かめられない仮定を明記し、swap-demo の実機確認項目に繋げる

```js
// src/spatial/plane-pnp.ts（4 点の平面 PnP）の回帰テスト。`npm test` で実行する。
// 検証しているもの / していないもの:
//   - 検証済み: 正解の姿勢から投影した 4 点を与えたら姿勢が復元されること、鏡像解のうち
//     重力（worldUp）に整合する方が選ばれること、正面付近の傾きが POSIT のように外れないこと
//   - 未検証（仮定）: 実カメラの焦点距離の推定値（camFov）。実機で床の高さと壁の距離が合うことを確認する
import { test } from "node:test";
import assert from "node:assert/strict";
import { solvePlanePose } from "../../dist/spatial/plane-pnp.js";

test("正解の姿勢から作った 4 点を与えると元の姿勢に戻る", () => {
  const truth = { /* ... */ };
  const pose = solvePlanePose(projectCorners(truth), { focalPx: 800, markerMm: 150 });
  assertNear(pose.position, truth.position, 1e-6);
});
```

何を書くか（mobile-mr で効いたもの）:

- **往復**: 合成した正解 → 入力を生成 → 復元が一致（最小二乗、PnP、視線 → UV）
- **境界と分岐**: 鏡像解の選択、ロスト → 復帰、ヒステリシス（グー / パー）、bfcache 復帰、例外を投げる 1 フレーム後もループが続く
- **プロトコル**: バージョン不一致で接続を拒む、役割（player / overview）で受け取る状態が違う
- **フェイク生成側との整合**: 生成（フェイク）と解く側に同じ仮定を置いていると仮定が間違っていてもテストは通る。その旨を「未検証」に書く

## ヘッドレス Chrome（フェイク入力）

mobile-mr の `scripts/headless-chrome-flow.mjs` と同じ骨格。ライブラリ（puppeteer / playwright）は足さない:

- `CHROME` 環境変数（既定 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`）。無ければ `SKIP:` を出して exit 0（CI やほかの Mac で落ちない）
- Chrome を `--headless=new --remote-debugging-port=9340 --use-fake-ui-for-media-stream --use-fake-device-for-media-stream --ignore-certificate-errors` 等で spawn し、`http://127.0.0.1:9340/json` からページの `webSocketDebuggerUrl` を取り、CDP を **Node 22 の組み込み WebSocket** で直接叩く（`ws` パッケージは足さない。API はブラウザ式で `addEventListener("message", …)`）
- `check(name, cond, detail)` で `PASS:` / `FAIL:` を 1 行ずつ出し、最後に FAIL 数で exit code を決める
- `Runtime.exceptionThrown` を全部集め、最後に **「例外ゼロ」を 1 項目として check する**（PAIN_POINTS「例外 1 回でアニメーションループが止まる」の回帰）
- 開始ボタンは `Runtime.evaluate` の `click()` ではなく **`Input.dispatchMouseEvent` の本物のクリック**で押す（user activation が要る。全画面・センサー許可の経路がここで分岐する）
- タッチ端末の模擬は `Emulation.setTouchEmulationEnabled` + `Emulation.setDeviceMetricsOverride`（縦持ち / 横持ち）。PC のマウス経路（`isTouchDevice()` が false）も別に 1 本回す
- 結果は HUD の文字列で読む（`document.querySelector('#hud').textContent` の `sensor=` `fs=` `lock=` `wake=`）。SDK 側の表記を mobile-mr と揃えておく理由はこれ
- **裏タブは描画ループが止まる**。2 端末を模擬するときはタブではなく**別ウィンドウ**（`Target.createTarget` に `newWindow: true`）（PAIN_POINTS 2026-08-26）

### どのページで回すか

このリポジトリにはデモページが無い（デモは全部 `../mobile-mr/demos/`。CLAUDE.md「デモページ: このリポジトリには持たない」）。

1. **原則**: 差し替え済みの mobile-mr のデモを、mobile-mr の既存スクリプトで回す（`cd ../mobile-mr && npm run check:chrome-flow` 等。swap-demo スキル）。dev サーバーは mobile-mr 側（`vite --port 5193 --strictPort` を spawn する形も同じ）
2. **SDK 単体で切り分けたいときだけ**: `test/page/index.html` に**テスト専用の最小 1 ページ**を足す（デモではない。UI を作り込まない）。足すときは理由を報告に書く

## 型チェック・ビルド

```bash
npx tsc --noEmit      # 型だけ
npm run build         # dist/ を出す（テストと file: 参照の両方がこれを見る）
```

`dist/` は `.gitignore` 済み。**古い dist を見て「直っていない」を踏みやすい**ので、テスト・差し替えの前に必ず build する。

## 報告

- `PASS` / `FAIL` / `SKIP` の行をそのまま貼る（要約だけにしない）
- FAIL が残っているのに「完了」と言わない。何が失敗し、原因は何で、何が未解決かを書く
- Chrome が無くて `SKIP` になった経路は「未検証」と明記する
- テストで「未検証（仮定）」に書いた項目は、swap-demo の実機確認で見る項目として引き継ぐ
