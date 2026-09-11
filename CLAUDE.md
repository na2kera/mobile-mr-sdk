# Mobile MR SDK

「URL を開いた複数のスマートフォンを、同じ現実空間を共有する MR デバイス群に変える」ためのライブラリ。
構想・ロードマップの原典は [mobile-mr/docs/CONCEPT.md](../mobile-mr/docs/CONCEPT.md)（§6 SDK 構成案・§7 API イメージ・Phase 11 の 4 段階戦略）。

## このリポジトリの立ち位置（4 段階戦略の段階 2）

```text
段階1: mobile-mr（../mobile-mr）を既存ライブラリありで実装しきる     ← Phase 1〜10-2 まで到達（一部は実機未確認）
段階2: 別リポジトリで独自ライブラリを新規に作る                    ← このリポジトリ。いまここ
段階3: mobile-mr のデモを、このライブラリで 1 デモずつ置き換える      ← このライブラリのドッグフーディング
段階4: 「毎回同じ形にしていた」部分をフレームワークとして切り出す      ← 段階3 の後。ここでは設計を先取りしない
```

- **入力は 2 つだけ**: 参照実装 = `../mobile-mr/src/shared/` と `../mobile-mr/server/`、要求仕様 = `../mobile-mr/docs/PAIN_POINTS.md`。
  新しい機能を発明しない。mobile-mr のデモが実際に必要とした処理と、PAIN_POINTS に書かれた痛点の解消だけを実装する
- **ラップではなく置き換え**。three-stdlib の DeviceOrientationControls、three 同梱の StereoEffect のような「暫定採用」は自力実装に置き換える。
  理由: 許可フロー等の制御点をラップでは持てない・拡張の余地がない・依存先の保守が止まっている（[mobile-mr PR #1 のコメント](https://github.com/na2kera/mobile-mr/pull/1#issuecomment-5255304585)）
- **例外: MediaPipe と Three.js は置き換えない**。手・体の推論モデル（MediaPipe）は自作しない。Three.js はレンダリングエンジンとして使い、その上のレイヤーを作る（CONCEPT.md §8）。
  SDK が持つのは「MediaPipe の出力を 3D 化する最小二乗・較正・ジェスチャー化」と「Three.js へのアダプタ」まで
- **mobile-mr 側は触らない**。段階3 の置き換えは mobile-mr のリポジトリで、デモ単位で行う。このリポジトリから mobile-mr のコードを import しない（写して整理する。参照元は必ずコメントに残す）

## 進め方（モジュール単位で「作る → 差し替える → 実機」を回す）

段階2 を全モジュール完成させてから段階3 に入るのではなく、**モジュール 1 つごとに段階3 を 1 デモぶん先取りして実機で確かめる**。
理由: 段階2 で作ったものが段階3 で使えないと分かるのが一番遅い失敗になる。1 モジュールごとに「mobile-mr の該当デモが同じ挙動で動く」を完了の定義にする。

1 モジュールの手順:

1. `../mobile-mr/docs/PAIN_POINTS.md` から該当する痛点を列挙し、「このモジュールで解消するもの / しないもの」を `docs/` に書いてから実装する
2. 参照実装（`../mobile-mr/src/shared/` の該当ファイル）を読み、URL パラメータ・較正値（`fov=auto` / `handScale` / `markerMm` 等）の意味を落とさない
3. PC で検証できる経路（フェイクカメラ・合成の手・ヘッドレス Chrome）を **SDK の機能として** 持つ。mobile-mr で毎回作り直していた「注入口」は SDK の正式な API にする
4. mobile-mr の該当デモ（最も古く、最も単純なもの。01 → 02 → 03 → 04 の順）を SDK で置き換えて **iPhone 実機 + ゴーグル**で確認する。置き換えで見つかった API の使いにくさは PAIN_POINTS と同じ形式で `docs/PAIN_POINTS.md`（このリポジトリ側）に残す

## モジュールと着手順

CONCEPT.md §6 の構成案を、痛点の多さ・実機確認の済み具合・依存関係で並べた順。**上から順に。飛ばさない**。

| 順 | パッケージ（仮） | 中身 | 置き換える暫定採用 | 主な痛点（PAIN_POINTS） | 差し替え先デモ |
| -- | --- | --- | --- | --- | --- |
| 1 | `core`（Session / 開始フロー / ライフサイクル） | センサー許可 → カメラ → 全画面化の直列化、2 タップ目、横向き固定、Wake Lock、bfcache 復帰、例外でループを止めない、iOS / Android Chrome の差の吸収 | mobile-mr の `start-flow.ts`（自前。ただし各デモに散った複製） | 開始フローのボイラープレート 4 本目 / bfcache で黙って死ぬ / Chrome で黙って変わる / 例外 1 回でループが止まる / 熱の状態を知る API がない | 01 |
| 2 | `tracking`（head） | DeviceOrientation からの頭の姿勢。許可フローは core に委ねる | three-stdlib `DeviceOrientationControls` | 許可フローの制御点がない（PR #1） | 01 |
| 3 | `stereo` | 左右 2 眼レンダリング、FOV / IPD / レンズ設定。**「3 つの FOV 問題」**（背景に整合する FOV ≠ 距離感が合う FOV。`fov=auto` ≈ 94° と表示較正 135° / `camZoom` 0.7）を設定として明示する | three 同梱 `StereoEffect` | FOV が一致せずスケール感の正解が分からない / 背景に整合する FOV と距離感が合う FOV は一致しない | 01 → 02 |
| 4 | `camera`（Passthrough） | `getUserMedia`、縦横比補正、回転追従、解像度指定、**フェイクカメラ（画像 + 3D ピンホール投影）** | `passthrough-camera.ts` / `fake-markers.ts`（自前） | getUserMedia を使うデモは PC で自動テストできない / 単眼パススルーに視差がない（仕様として明記） | 02 |
| 5 | `spatial`（Marker / Anchor / Surface） | ArUco 検出、姿勢推定（POSIT の誤差 API の罠、鏡像解）、平滑化・ロスト処理、**重力での水平化**、マルチマーカーのレイアウト、Surface（壁・床）、`markerMm` の統一 | `js-aruco2` の POSIT（検出は残し、姿勢推定だけ置き換える。下記「技術スタック」） | js-aruco2 が CJS で import できない / ハミング距離の既定が緩い / 焦点距離が取れない / POSIT の誤差 API の罠 / 実用距離が短い / 1 枚の傾きは信用できない（#54, #55） / 座標系が 3 段で揃え損なう | 03 |
| 6 | `network`（Room / Player / State Sync） + サーバー | **コア（ランタイム非依存の Room ロジック）+ アダプタ（Vite 同居 / Node `attach` / Cloudflare DO）** の 2 層。役割（player / overview）、room 設定の配布、プロトコルのバージョン、サーバー権威 + クライアント予測の骨組み | `server/room-server.ts` + 各ゲームの `*-protocol.ts`（自前だが 4 本目で抽出） | Room サーバーのボイラープレート 2〜4 本目 / wss は Vite 同居が必須 / 役割がない / room 設定が URL クエリでは運営に向かない / 乱数を通信に載せるしかない | 04 |
| 7 | `tracking`（hands / body） | MediaPipe の出力の 3D 化（最小二乗、`handScale` 較正の自動初期化 = mobile-mr issue #10）、手スロット、ジェスチャーのイベント化（ヒステリシス）、指差しの視線、合成の手・体の注入口、オクルージョン | MediaPipe は残す。`hand-tracker.ts` / `hand-math.ts` / `hand-slots.ts` / `pose-tracker.ts` 等を整理 | wasm 配信・モデル配布 / 距離を返さない / handedness の食い違い / 合成の手 / 同じ「回す手順」が 2 本目 / 同期推論がフレーム時間を揺らす | 05 |
| 8 | `three`（アダプタ） | 上記を Three.js のシーン・カメラに繋ぐ薄い層。各モジュールは Three.js 非依存の数学（`Quaternion` 等の型だけ）で書き、ここで束ねる | — | — | 全部 |

外付けハード（Joy-Con の WebHID ハブ、`swing-detector.ts`）と各ゲームのルール（`*-game.ts` / `*-sim.ts`）は **SDK に入れない**。ゲーム固有のものは段階3 でも mobile-mr 側に残す。

## 完了の定義（モジュールごと）

- `../mobile-mr/docs/PAIN_POINTS.md` の該当項目に「解消 / 仕様として明記 / 対象外」のどれかを付けられる
- PC で自動確認できる（Node のテスト + フェイク入力でのヘッドレス Chrome。mobile-mr の `scripts/test-*.mjs` / `headless-*.mjs` と同じ形）
- mobile-mr の差し替え先デモが **iPhone 実機 + ゴーグル**で従来と同じに動く。自分で確認できない部分は「実機確認待ち」と明記し、「完了」と言わない
- 型チェック（`tsc`）が通る

## 技術スタック

- TypeScript。Three.js は peer dependency（利用側のバージョンを使う）。React 等の UI フレームワークは使わない
- mobile-mr と同じ Vite / TypeScript / Three.js の系列に合わせる（mobile-mr: vite 8 / typescript 6 / three 0.185 / @mediapipe/tasks-vision 1.0）。**バージョン含め勝手に変えない。変更が要るときは理由と選択肢を提示して相談する**
- 以下は決定済み（2026-09-12。各項目の比較は決定時に行った。変えるときは理由を添えてこの節を更新する）:
  - **パッケージ構成: 単一パッケージ**（`mobile-mr-sdk` 1 つ。中は `src/core/` `src/stereo/` … のフォルダで分ける）。`@mobile-mr/*` への分割は段階3 で境界が分かってから。理由: まだ 1 行も書いていない段階で境界を固定しない。単一 → 分割は機械的な作業で済む
  - **ビルド: tsc のみ**（ESM の .js + .d.ts を `dist/` に出す。バンドルしない）。理由: 利用側は Vite 等のバンドラを持つ前提なので素の ESM が最も扱いやすく、部分 import と tree-shaking が効く
  - **テスト: `node --test`**（追加依存ゼロ。tsc で出した `dist/` を対象に回す。ブラウザ経路はフェイク入力 + ヘッドレス Chrome のスクリプトで、mobile-mr の `scripts/headless-*.mjs` と同じ形）。理由: テスト対象の大半は Three.js 非依存の数学とルールで、ブラウザ API は jsdom では再現できない
  - **ArUco: 検出は js-aruco2 を残し、姿勢推定だけ自力実装**（4 点の平面 PnP。鏡像解の選択・重力の拘束・焦点距離の扱いを制御点として持つ）。検出側（二値化・輪郭・ID 復号）の置き換えは痛点が実害になってから。理由: 重い痛点（issue #54, #55 の傾きの誤り・鏡像解、誤差 API の罠）は姿勢推定に集中しており、検出側の痛点（CJS 迂回・ハミング距離）は軽い
  - **デモページ: このリポジトリには持たない**。確認は mobile-mr から `file:../mobile-mr-sdk` で参照して該当デモを置き換えて行う（= 段階3 の作業そのもの）。理由: dev サーバー・HTTPS・フェイク入力・スキルが mobile-mr に揃っており、見本と実使用のずれも生じない。単体で切り分けたい場面が出たらその時に最小の 1 ページを足す

## やらないこと

- 段階4（フレームワーク化、user 画面 / master 画面のスキャフォールディング）の設計を先取りしない
- mobile-mr のデモが必要としていない機能を「将来のため」に作らない。CONCEPT.md §7 の API イメージは目標であって仕様ではない
- 段階1 の未完了項目（実機未確認のデモ、mobile-mr の open issue）をこちらで巻き取らない。それは mobile-mr 側で進める

## 開発環境の前提

- 実機検証は **iPhone（iOS Safari）+ スマホ用 VR ゴーグル**中心。センサー・カメラは HTTPS 必須。手順は mobile-mr の `iphone-test` / `dev-address` スキルに従う
- 痛点の記録はこのリポジトリでも成果物の一部（`docs/PAIN_POINTS.md`。形式は mobile-mr の `pain-point` スキルと同じ）
- 応答は日本語。「完了」は実機またはブラウザで動かして確認してから
