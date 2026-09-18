---
name: new-module
description: SDK のモジュール（core / tracking / stereo / camera / spatial / network / three）に着手する手順。「core を始めたい」「次のモジュールに進む」「stereo を作って」と言われたら使う。mobile-mr の PAIN_POINTS から該当痛点を列挙 → docs/<module>.md に「解消する / しない」を書く → 参照実装（../mobile-mr/src/shared/）を読んで写して整理 → src/<module>/ に実装 → PC で確認 → 差し替え先デモで実機、までを一貫して行う。着手順は CLAUDE.md の表のとおりで飛ばさない。
---

# モジュールに着手する

このリポジトリの入力は 2 つだけ。**参照実装** = `../mobile-mr/src/shared/` と `../mobile-mr/server/`、**要求仕様** = `../mobile-mr/docs/PAIN_POINTS.md`。
新しい機能を発明しない。mobile-mr のデモ（`../mobile-mr/demos/`）が実際に必要とした処理と、PAIN_POINTS の痛点の解消だけを実装する。

着手順は CLAUDE.md「モジュールと着手順」の表（core → tracking(head) → stereo → camera → spatial → network → tracking(hands/body) → three）。**上から順に。飛ばさない。**
モジュールを全部作ってから差し替えるのではなく、**1 モジュールごとに差し替え先デモ 1 本を実機で確かめてから次へ進む**（swap-demo スキル）。

## ディレクトリ規約

```text
src/
├─ core/        Session / 開始フロー / ライフサイクル（許可 → カメラ → 全画面の直列化、Wake Lock、bfcache 復帰、例外でループを止めない）
├─ tracking/    head（DeviceOrientation）。後で hands / body（MediaPipe の出力の 3D 化）
├─ stereo/      左右 2 眼、FOV / IPD / レンズ設定（「3 つの FOV 問題」を設定として明示）
├─ camera/      getUserMedia、縦横比・回転追従、フェイクカメラ（画像 + 3D ピンホール投影）
├─ spatial/     Marker / Anchor / Surface（js-aruco2 の検出は残し、姿勢推定だけ自力実装）
├─ network/     Room の コア（ランタイム非依存）+ adapters/（Vite 同居 / Node attach / Cloudflare DO）
├─ three/       Three.js アダプタ。**実行時に three を import するのはここだけ**
└─ index.ts     公開 API。部分 import 用に src/<module>/index.ts も置く
test/           node --test（pc-check スキル）
scripts/        headless-*.mjs（pc-check スキル）
docs/
├─ <module>.md  このモジュールで「解消する / しない」痛点（下の手順 1）
└─ PAIN_POINTS.md  SDK 側の痛点（pain-point スキル）
```

- 各モジュールは Three.js 非依存の数学で書く。`three` からは `import type` だけ許し、実行時の import は `src/three/` に閉じる。理由: Node のテストで three を要らなくする・利用側の three と二重化しない・tree-shaking が効く
- **単一パッケージ**（`mobile-mr-sdk` 1 つ）。`@mobile-mr/*` への分割は段階3 で境界が分かってから
- **ビルドは tsc のみ**（ESM の .js + .d.ts を `dist/` へ）。バンドルしない。`three` は peer dependency

## 手順

### 1. 痛点を列挙して `docs/<module>.md` を書く（実装より先）

```bash
grep -n '^## ' ../mobile-mr/docs/PAIN_POINTS.md
```

該当する見出しを拾い、表にする。**「しない」も書く**（差し替え時に「これは対象外」と即答できるように）:

```markdown
# <module> が扱う痛点

参照: ../mobile-mr/docs/PAIN_POINTS.md（見出しの日付とタイトルで引く）

| mobile-mr の痛点（日付 / タイトル） | このモジュールで | 備考 |
| --- | --- | --- |
| 2026-08-13 全画面遷移中はセンサー許可ダイアログが出ない | 解消 | 許可 → カメラ → 全画面を直列化し、2 タップ目を API で持つ |
| 2026-08-21 単眼パススルーの背景には視差が無い | 仕様として明記 | SDK では解けない。docs に制約として書く |
| 2026-09-05 Joy-Con の IMU が読めず PC をハブにした | 対象外 | 外付けハードは SDK に入れない（CLAUDE.md） |
| … | 別モジュール（stereo） | |
```

「解消 / 仕様として明記 / 対象外 / 別モジュール」のどれかを必ず付ける。これがそのままモジュールの完了の定義になる。
mobile-mr 側の `PAIN_POINTS.md` には書き込まない（mobile-mr 側は触らない）。

### 2. 参照実装を読む（写す前に、URL パラメータと較正値の意味を落とさない）

モジュールごとの読む候補（`../mobile-mr/src/shared/` 直下。server は `../mobile-mr/server/`）:

| モジュール | 参照実装 | 置き換える暫定採用 |
| --- | --- | --- |
| core | `start-flow.ts`（runStartFlow / setupFullscreen / lockLandscape / watchSensorEvents / keepScreenAwake）、`url-params.ts`、各デモ `main.ts` の開始部分 | mobile-mr 自前（各デモに散った複製） |
| tracking(head) | `docs/pain-points/01-device-orientation-controls.md`、three-stdlib の `DeviceOrientationControls`（node_modules 内。写さず、挙動の仕様として読む） | three-stdlib `DeviceOrientationControls` |
| stereo | 01 / 02 の `main.ts` の `fov` / `camZoom` / `fov=auto` の扱い、three 同梱 `StereoEffect` | three `StereoEffect` |
| camera | `passthrough-camera.ts`、`fake-markers.ts`（3D ピンホール投影のフェイクカメラ） | 自前 |
| spatial | `marker-detector.ts`、`marker-anchor.ts`（`worldUp` / `extraMarkers`）、`marker-layout.ts`（`levelRotation`）、`marker-drag.ts`、`surface.ts`、`js-aruco2.d.ts` | js-aruco2 の POSIT（検出は残す） |
| network | `server/room-server.ts`、`server/shared-room.ts`、`*-protocol.ts`、`remote-log.ts` / `server/client-log.ts` | 自前（4 本目で抽出済み） |
| tracking(hands/body) | `hand-tracker.ts`、`hand-math.ts`、`hand-slots.ts`、`fake-hands.ts`、`pose-tracker.ts`、`body-math.ts`、`fake-body.ts`、`landmarker-tracker.ts`、`hand-occluder.ts`、`throw-detector.ts` | MediaPipe は残す |
| three | `hand-view.ts`、`skeleton-view.ts`、`text-panel.ts` 等の描画側 | — |

**落としてはいけない URL パラメータ・較正値**（mobile-mr の demos / shared での使用数順）: `camFov` `fov`（`auto` あり）`markerMm`（既定 150mm = `DEFAULT_MARKER_MM`）`fakecam` `camZoom` `room` `name` `handScale` `gravityAlign` `fakehands` `fakebody`。
意味が分からない値は推測せず、参照元のコメントと PAIN_POINTS の該当項目を読む（例: 「3 つの FOV 問題」= 背景に整合する FOV ≈ 94° と距離感が合う表示較正 135° / `camZoom` 0.7 は一致しない）。

### 3. 写して整理する（import しない）

- `../mobile-mr` のコードを import しない。**写して整理する**。ファイル先頭に参照元を残す:

  ```ts
  // 参照元: ../mobile-mr/src/shared/start-flow.ts（runStartFlow, setupFullscreen）
  // 変更点: 許可 → カメラ → 全画面の順序を Session が持つ。HUD への status 文字列は同じ表記を保つ
  ```

- 座標系・単位・回転順・HUD の表記（`sensor=` `fs=` `lock=` `wake=` 等）は参照元と同じにする。mobile-mr の `headless-*.mjs` が HUD の文字列を解析しており、変えると差し替え時にテストが壊れる
- 参照元にあるヒューリスティック（既定値・しきい値・ヒステリシス）は理由をコメントで残す。理由が分からないものは「参照元のまま。理由不明」と書く
- **ラップではなく置き換え**。three-stdlib / StereoEffect を内部で呼ぶ実装にしない（許可フロー等の制御点を持てない）

### 4. 「注入口」を SDK の正式な API にする

mobile-mr で毎回作り直していたフェイク入力（フェイクカメラ、合成の手・体、合成の姿勢）は、URL パラメータの裏口ではなく **SDK の API**（例: `Session` にフェイクのソースを渡せる）にする。
URL パラメータ（`?fakecam=1` 等）からその API を呼ぶ薄い層は別に置く。理由: PC で自動テストできる経路を SDK 自身が持つ（PAIN_POINTS「getUserMedia を使うデモは PC で自動テストできない」「手トラッキングは PC で再現できず、合成の手の注入口を作った」）。

### 5. PC で確認する

pc-check スキル。Node のテスト（`node --test`、`dist/` を対象）+ フェイク入力でのヘッドレス Chrome。`npx tsc --noEmit` と `npm run build` が通ること。

### 6. 差し替え先デモで実機

swap-demo スキル。差し替え先は CLAUDE.md の表（core / tracking(head) / stereo → 01、camera → 02、spatial → 03、network → 04、hands/body → 05）。
**mobile-mr の該当デモが従来と同じ挙動で iPhone 実機 + ゴーグルで動く**まで、このモジュールは「完了」ではない。自分で確認できない部分は「実機確認待ち」と明記する。

## 完了の定義（チェックリスト）

- [ ] `docs/<module>.md` に該当痛点すべてへ「解消 / 仕様として明記 / 対象外 / 別モジュール」が付いている
- [ ] Node のテストが PASS（`node --test`）。ブラウザ経路はヘッドレス Chrome で例外ゼロ
- [ ] `npx tsc --noEmit` が通る
- [ ] 差し替え先デモが PC（mobile-mr の既存 `test:*` / `check:*`）で従来どおり動く
- [ ] iPhone 実機 + ゴーグルで従来どおり動く（未確認なら「実機確認待ち」と報告に明記）
- [ ] 差し替えで見つかった API の使いにくさを `docs/PAIN_POINTS.md` に残した（pain-point スキル）

## 注意

- npm パッケージを足さない・バージョンを変えない（vite 8 / typescript 6 / three 0.185 / @mediapipe/tasks-vision 1.0 系）。必要なら理由と選択肢を提示して相談する
- CONCEPT.md §7 の API イメージは目標であって仕様ではない。mobile-mr のデモが必要としていない機能を「将来のため」に作らない
- 段階4（フレームワーク化、user / master 画面のスキャフォールディング）を先取りしない
