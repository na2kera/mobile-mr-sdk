---
name: swap-demo
description: 段階3 の差し替え — mobile-mr のデモ 1 本の暫定採用ライブラリを、この SDK に置き換えて実機で確かめる。「01 を SDK で置き換えて」「mobile-mr のデモに差し替えて」「実機で確かめたい」「ドッグフーディング」と言われたら使う。デモはこのリポジトリには無く、すべて ../mobile-mr/demos/ にある。SDK を build → mobile-mr 側で file:../mobile-mr-sdk を参照 → 該当デモを置き換え → mobile-mr の既存テスト + iPhone 実機（+ ゴーグル）で従来と同じ挙動を確認 → API の使いにくさを docs/PAIN_POINTS.md に残す。
---

# デモ 1 本を SDK で差し替える（段階3）

**デモはこのリポジトリには無い。** 動くものは全部 `../mobile-mr/demos/` にあり、dev サーバー（HTTPS + LAN）・フェイク入力・ヘッドレススクリプト・実機の手順も mobile-mr 側に揃っている。
このリポジトリの「動作確認」は、mobile-mr の該当デモを SDK で置き換えて動かすこと **そのもの**（CLAUDE.md「デモページ: このリポジトリには持たない」）。

| デモ（`../mobile-mr/demos/`） | 使っている暫定採用 / 自前 | 差し替えるモジュール |
| --- | --- | --- |
| `01-stereo-box` | three-stdlib `DeviceOrientationControls`、three `StereoEffect`、OrbitControls（PC 用） | core / tracking(head) / stereo（**最初はここ**） |
| `02-passthrough` | `passthrough-camera.ts`、`fov=auto` / `camZoom` | stereo / camera |
| `03-marker-anchor` | js-aruco2（検出 + POSIT）、`marker-anchor.ts` | spatial |
| `04-shared-room` | `server/shared-room.ts` + `shared-room-protocol.ts`（ws は Vite 同居） | network |
| `05-hand-interaction` | MediaPipe HandLandmarker、`hand-math.ts`、`fake-hands.ts` | tracking(hands) |
| `06-volleyball` / `06-2-darts` / `07-surface-mapping` / `08-splatoon`（+ `overview.html` / `markers.html`）/ `09-person-id` / `10-golf` / `10-2-batting` / `ex2-1-joycon-rc` / `ex8-1-god-hand` | 上記の組み合わせ + ゲーム固有（SDK に入れない） | 段階3 の後半。順番どおり 01 から |

差し替えは **最も古く最も単純なデモから**（01 → 02 → 03 → 04 → 05）。一括で置き換えない。

## どこで作業するか

- **編集は mobile-mr のリポジトリ側**（`../mobile-mr`）。mobile-mr は worktree 運用なので、そちらでブランチ / worktree を切る。mobile-mr の CLAUDE.md とスキル（`new-demo` / `pain-point` / `iphone-test` / `dev-address`）に従う
- このリポジトリのコミットに mobile-mr の変更を混ぜない。逆も同じ（SDK の修正が要ると分かったら、こちらで直して build し直す）
- 過去デモは削除・上書きしない方針（mobile-mr）なので、差し替えは **該当デモの `main.ts` の中で import 先を替える**形。他のデモは従来のまま動くこと

## 手順

### 1. SDK を build する

```bash
npm run build        # dist/ を出す。dist は gitignore 済みなので参照前に毎回 build する
```

古い `dist/` を mobile-mr が見て「直っていない」になるのが一番多い空振り。SDK を直したら必ず build → mobile-mr のページを reload。

### 2. mobile-mr から参照する

`../mobile-mr/package.json` に `"mobile-mr-sdk": "file:../mobile-mr-sdk"` を足して `npm install`（`node_modules/mobile-mr-sdk` が symlink になる）。これは mobile-mr 側の変更なので、そのブランチで行う。

初回に起き得る落とし穴（起きたら直す。先回りで設定を増やさない）:

- **three が二重になる**: SDK 側の `node_modules/` に three（型のための devDependency）が入っていると、symlink の実体側から解決されて利用側と別インスタンスになる。症状は `instanceof` が false になる・`Object3D` を add できない等。対処は mobile-mr の `vite.config.ts` に `resolve.dedupe: ["three"]`（mobile-mr の設定変更なので相談してから）
- **Vite の serving allow list**: symlink の実体が mobile-mr の外にあるので `The request is outside of Vite serving allow list` が出ることがある。対処は `server.fs.allow` に `..` を足す（同上）
- **HMR が効かない**: SDK は tsc の出力なので、SDK 側の変更は `npm run build`（または `tsc --watch`）→ reload

### 3. デモを置き換える

01 の例: `three-stdlib` の `DeviceOrientationControls` と `three/examples/jsm/effects/StereoEffect.js` の import を SDK の API に替える。

守ること:

- **URL パラメータは同名・同義のまま**（`fov` `camZoom` `camFov` `markerMm` `handScale` `gravityAlign` `fakecam` `fakehands` `fakebody` `room` `name`）。実機確認の手順・README・headless スクリプトが依存している
- **見た目・操作・HUD の表記を変えない**（UI / UX 変更禁止）。HUD の `sensor=` `fs=` `lock=` `wake=` は mobile-mr の `headless-*.mjs` が解析する
- 差し替え対象以外のファイル（`src/shared/` の共通コード、他デモ）には手を入れない。共通コードの置き換えが要るなら、それは次のデモ以降の差し替え時に
- SDK に無い機能が要ると分かったら、mobile-mr 側で回避策を書かず **SDK 側に戻って足す**（ただし「そのデモが実際に必要としたもの」だけ。将来のためには作らない）

### 4. PC で確認する（mobile-mr 側）

```bash
cd ../mobile-mr
npx tsc --noEmit
npm run check:chrome-flow            # 開始フロー（core を差し替えたら必須）
npm run test:<demo> && npm run check:<demo>   # 該当デモにあるもの（01〜05 は無いものもある）
```

差し替えていないデモの `test:*` / `check:*` も 1 周回して、従来どおりであることを確かめる。

### 5. 実機で確認する

手順とチェックリストは **iphone-test スキル**。URL は `https://<ホスト名>.local:<port>/demos/NN-xxx/` の形で渡す（IP 直打ちで答えない。詳細は同スキル）。
比較の基準は **「差し替え前と同じ挙動」**。差し替え前を同じ端末で先に見ておくと差が分かる（別ポートで main ブランチの dev サーバーを立てる、または差し替え前のコミットのプレビュー）。

自分で確認できない部分は **「実機確認待ち」と明記し、「完了」と言わない**。

### 6. 痛点と付け替えを残す

- 差し替えで感じた **API の使いにくさ**（引数が多い・順序が分かりにくい・型が合わない・mobile-mr 側で回避策を書きたくなった）は、このリポジトリの `docs/PAIN_POINTS.md` に pain-point スキルの形式で残す。これが段階4 の材料
- `docs/<module>.md` の表で、そのデモが踏んでいた mobile-mr の痛点に「解消 / 仕様として明記 / 対象外」が付いているか見直す。実機で解消を確認できたものだけ「解消」にする
- mobile-mr 側の `docs/PAIN_POINTS.md` は書き換えない

## 報告に含めること

- どのデモの何を何に差し替えたか（ファイル名と import の before / after）
- PC 確認の PASS / FAIL 出力（pc-check スキル）
- 実機確認の結果、または「実機確認待ち」
- 残した痛点の見出し
