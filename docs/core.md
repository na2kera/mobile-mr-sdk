# core — Session / 開始フロー / ライフサイクル

着手順 1 番目のモジュール。参照実装は `../mobile-mr/src/shared/start-flow.ts`（06 以降が使う抽出版）と
`../mobile-mr/demos/01-stereo-box/main.ts`（抽出前の元の形）、差し替え先は `demos/01-stereo-box/`。

## 責務

「開始ジェスチャー（タップ）は 1 回しか使えない希少資源」を中心概念にして、次を 1 か所で扱う。

1. **開始フロー**: センサー許可 → カメラ → 全画面化 → 横向き固定 → Wake Lock を正しい順序で直列化し、各段階の成否を構造化して返す
2. **ライフサイクル**: pagehide / pageshow(bfcache) / visibilitychange で保持リソースを畳む・張り直す。ジェスチャーが再度要るものは「タップで再開」の状態を出す
3. **フレームループ**: 登録した処理を 1 つずつ例外から隔離して回し、失敗はイベントで通知する。フレーム時間を計測して公開する
4. **設定**: URL クエリの読み取りを 1 種類の署名に統一する。端末ごとの較正値を保存して次回自動で使う

**持たないもの**: DOM（ボタン・オーバーレイ・HUD）。core は状態を返すだけで、ボタンをいつ出すかは状態から利用側が決める。
理由: mobile-mr の各デモは自前の開始オーバーレイと HUD を持っており、UI は SDK が決めるものではない（UI/UX を勝手に変えない）。
頭追従の数学（DeviceOrientation → 姿勢）も持たない。それは `tracking`（head）で、core は許可の結果だけ渡す。

## 痛点の仕分け（`../mobile-mr/docs/PAIN_POINTS.md`）

| 日付 / 出所 | 痛点 | 仕分け | core での扱い |
| --- | --- | --- | --- |
| 08-11 / 01 | DeviceOrientationControls が許可フローを隠蔽していて制御できない | **解消** | 許可要求は core の `start()` が明示的に行い、結果（granted / denied / no-api / エラー）を返す。tracking は許可済みの前提で動く |
| 08-12 / 01 | 同上の詳細（許可タイミング・拒否時 UX・`enabled` の意味が観測できない） | **解消** | 同上。拒否は `sensor.permission = "denied"` として観測でき、利用側が代替（OrbitControls 等）に分岐できる |
| 08-13 / 01 | ブラウザ UI が VR 表示に被り、全画面の手段が限定的（iOS 17.2+ のみ、ジェスチャー必須） | **解消 + 明記** | `requestFullscreen` を開始フローの末尾で試み、非対応（`unsupported`）は状態として返す。100dvh のフォールバックは CSS の話なので「利用側で行う」と明記。`fullscreenchange` の解除検知と再入（`session.enterFullscreen()`）を提供 |
| 08-13 / 01 | 全画面遷移中は許可ダイアログが出ない（1 タップに同居できない） | **解消** | ダイアログ系（センサー → カメラ）を先に直列、全画面化は最後。activation 失効で拒否されたら `fullscreen = "needs-tap"` を返し、利用側が 2 タップ目のボタンを出す |
| 08-14 / 02 | 開始ジェスチャーの奪い合いにカメラ許可が 3 人目として参加 | **解消** | `start({ camera })` にカメラ開始関数を渡す形（参照実装と同じ）。順序は core が固定し、利用側は順序を知らなくてよい |
| 08-17 / 04 | bfcache 復帰でカメラ・接続が黙って死ぬ（ライフサイクル管理が毎デモ手書き） | **解消** | `session.lifecycle.register({ suspend, resume })`。pagehide で全部 suspend、pageshow(persisted) で resume を試み、resume が `"needs-gesture"` を返したものは `session.state.pendingResume` に載せる。カメラの再取得そのものは `camera` モジュールが resume で行う |
| 08-21 / 05 | 例外 1 回でアニメーションループが止まり、装着中は原因も見えない | **解消（前半）** | `session.loop.add(fn)` で登録した処理ごとに try/catch し、失敗は `"error"` イベント + 状態に残す（描画は止めない）。「装着中に読める 3D の状態表示」は core では**対象外**（three アダプタ以降） |
| 08-21 / 05 | パススルー + 開始フローのボイラープレートが 4 本目。`numParam` の署名が 2 種類 | **解消** | 開始フローは上記。`numParam` は min/max 付きの 1 種類に統一（`readNumber(params, name, fallback, {min,max})`）。パススルー側は `camera` モジュール |
| 08-26 / 06 | デモを統合すると URL パラメータの名前が衝突する。較正値を毎回 URL に書かせる運用は破綻する | **解消（一部）** | (1) SDK が読むパラメータ名は各モジュールの `PARAMS` 定数に一覧し、core が重複を検出する。(2) 端末ごとの較正値（fov / camZoom / handScale 等）は `session.profile`（localStorage）に保存し、URL 指定 > 保存値 > 既定の優先で読む。構造化クエリ（`tracking.hands.smooth`）は**やらない**（mobile-mr のブックマークが壊れる） |
| 09-02 / 全体 | iOS で詰めた開始導線が Chrome では「黙って」変わる（許可 API の有無・イベントが届かない・lock / Wake Lock の可否・長押しの contextmenu・縦長 PC ウィンドウ） | **解消** | 結果を「許可の有無」でなく「センサーが実際に届いたか（3 秒監視）」「全画面・横向き固定・Wake Lock のそれぞれの成否」で返す。contextmenu 抑止と「縦向き案内の条件は `(pointer: coarse)` を伴う」は core のオプション + 明記 |
| 09-03 / 全体 | スマホが熱くなるが、熱の状態を知る API がなく、負荷をまとめて下げる場所もない | **対象外（土台だけ）** | 品質のノブは各モジュールが揃ってから。core はフレーム時間の計測（`loop.stats`）だけ持ち、後で熱制限の間接検知に使う |

## API（案）

```ts
import { createSession } from "mobile-mr-sdk/core";

const session = createSession();
session.touch;            // boolean。(pointer: coarse)

// 開始ボタンのクリックハンドラ内で呼ぶ（ユーザージェスチャー必須）
const result = await session.start({
  sensors: true,                              // DeviceOrientation の許可
  camera: async () => { /* camera モジュール or 利用側 */ },
  fullscreen: true,
  orientationLock: "landscape",               // 全画面成功後に試す（Android Chrome）
  wakeLock: true,
  suppressContextMenu: true,                  // 長押しの contextmenu を止める
});
// result（= session.state と同じ形。以後は "change" イベントで更新）
// {
//   sensor:      { permission: "granted" | "denied" | "no-api" | { error }, events: "pending" | "ok" | "none" },
//   camera:      "ok" | "skipped" | { error },
//   fullscreen:  "ok" | "unsupported" | "needs-tap" | { error },
//   orientation: "ok" | "unsupported" | "skipped" | { error },
//   wakeLock:    "ok" | "unsupported" | "released" | { error },
//   inFullscreen: boolean,
//   pendingResume: string[],                 // bfcache 復帰後にジェスチャーが要るリソース名
// }

session.on("change", (state) => { /* HUD やボタンの表示を更新 */ });
session.enterFullscreen();                    // 2 タップ目・解除後の再入
session.resume();                             // pendingResume をジェスチャー内で再開

session.lifecycle.register("camera", { suspend() {}, async resume() { return "ok" | "needs-gesture"; } });

session.loop.add("hands", (dt, now) => { /* 例外は隔離され "error" イベントになる */ });
session.loop.start(); session.loop.stats;    // { frameMs, ... }

// 設定
import { readNumber, readResolution, createProfile } from "mobile-mr-sdk/core";
const profile = createProfile("mobile-mr");  // localStorage。fov / camZoom 等を保存・読み出し
```

- `start()` は 1 回だけ呼べる。2 回目は reject
- `touch = false`（PC）のときは許可・全画面・Wake Lock を飛ばし、`camera` だけ呼ぶ（参照実装と同じ）

## PC での確認（済み 2026-09-12）

- 純粋な部分（順序の決定、状態の遷移、`readNumber` / `profile`）は `npm test`（`node --test`。ブラウザ API は `createSession({ env })` に偽物を渡す。`test/core/fake-env.mjs`）。29 件
- 経路は mobile-mr 側の `npm run check:stereo-box`（`scripts/headless-stereo-box.mjs`。タッチ端末を模擬 → granted + events-none / fs=ok / lock=NotSupported / wake=ok が HUD に出る。PC 経路 → 全部飛ばして mode=orbit）。23 件

## 差し替え先（段階 3 の先取り）

`demos/01-stereo-box/main.ts` の開始フロー・全画面・HUD・ループを `createSession` に置き換えた（mobile-mr の `feature/sdk-core-01`。`package.json` に `"mobile-mr-sdk": "file:../mobile-mr-sdk"`）。
頭追従（DeviceOrientationControls）と 2 眼（StereoEffect）はこの時点では残す（`tracking` / `stereo` で置き換える）。
置き換え前の 01 に無かった横向き固定・Wake Lock・contextmenu 抑止は 06 以降と同じ既定（on）にした。tsc / vite build / ヘッドレス Chrome は通過。

**iPhone 実機 + ゴーグル: 未確認。** 確認項目:
- 初回訪問: 許可ダイアログ → 「タップで全画面表示」（2 タップ目）が出る → タップで全画面
- 許可済み（リロード）: 1 タップで全画面まで行く。HUD に `sensor=granted events-ok` / `fs=ok lock=unsupported` / `wake=ok`
- 上端スワイプで解除 → ボタンが出る → 再入できる
- 拒否したとき: 頭追従なしで続き、全画面にならない（`sensor=denied`）
