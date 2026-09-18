---
name: iphone-test
description: iPhone 実機（iOS Safari）+ スマホ用 VR ゴーグルで SDK の挙動を確認する手順とチェックリスト。「実機で確認したい」「スマホで見たい」「iPhoneでテスト」「アドレス教えて」と言われたとき、またはセンサー・カメラ・全画面・ws を通る変更を検証するときに使う。動かすページはこのリポジトリには無く ../mobile-mr のデモ（swap-demo で差し替えたもの）。dev サーバーは mobile-mr 側で LAN + HTTPS、URL は必ず `https://<ホスト名>.local:<ポート>/` の形で渡す。
---

# iPhone 実機確認

検証基準は iPhone（iOS Safari）+ ゴーグル。センサー・カメラは secure context（HTTPS）必須。
**このリポジトリにはデモページが無い**ので、動かすのは `../mobile-mr/demos/` の該当デモ（SDK に差し替えたもの。swap-demo スキル）。dev サーバーも mobile-mr 側で立てる（`vite.config.ts` に `@vitejs/plugin-basic-ssl` と `server.host: true` があり、`npm run dev` だけで LAN + HTTPS になる）。

## 手順

1. **SDK を build**（`npm run build`）。mobile-mr は `dist/` を見る
2. **dev サーバー**（mobile-mr 側）: `cd ../mobile-mr && npm run dev`（バックグラウンド起動にして出力を確認する）
3. **URL を渡す**（下の「URL の出し方」）。開いてほしいページとクエリまで含めた形で
4. 実機の結果を聞く。問題があれば直して build → reload。**実機で従来と同じに動くまで「完了」と言わない**。自分で確認できない部分は「実機確認待ち」と明記する
5. ハマった点は pain-point スキルで `docs/PAIN_POINTS.md` に残す

## URL の出し方（mobile-mr の dev-address スキルの要点）

答えはいつもこの形。**IP 直打ち（`https://192.168.x.x:5173/`）では答えない**（Wi-Fi が変わるたびに変わり、mobile-mr で実際に 2 回「開けない」が起きた）:

```text
https://na2keraMacBook-Air.local:5173/demos/01-stereo-box/
```

```bash
scutil --get LocalHostName                         # ホスト名（ハードコードしない）
lsof -nP -iTCP:5173 -sTCP:LISTEN                   # 誰が 5173 を持っているか
lsof -p <PID> -a -d cwd | tail -1                  # その dev サーバーの worktree（別ブランチのコードを見せないため）
curl -sk -o /dev/null -w '%{http_code}\n' https://$(scutil --get LocalHostName).local:5173/   # 200 を確認してから渡す
```

- 別の worktree の dev サーバーが同じポートを掴んでいたら、勝手に kill せず「止めて良いか / 別ポート（`npx vite --port 5174 --strictPort`）で立てるか」を聞く
- 開けないと言われたら順に: 同じ Wi-Fi か（`.local` は同じ LAN 内のみ）→ 自己署名証明書の警告（iOS Safari は「詳細を表示 → この Web サイトを閲覧」）→ dev サーバーが落ちていないか → 最後の手段として IP（`ipconfig getifaddr en0`。Tailscale の `utun` ではなく `en0`）を「次に Wi-Fi が変わると使えない」と添えて案内

## iOS Safari チェックリスト（= core が吸収すべき制約）

実機で問題が出たらまずここを疑う。これらは PAIN_POINTS に記録済みの痛点であり、SDK の `core` / `camera` が API として持つべき制御点でもある:

- **センサー許可**: `DeviceOrientationEvent.requestPermission()` / `DeviceMotionEvent.requestPermission()` は**タップ等のユーザージェスチャー内**でしか呼べない。ページロード時に呼ぶと失敗する
- **1 タップに同居できない**: 全画面遷移中はセンサー許可ダイアログが出ない。カメラ許可が「3 人目」として開始ジェスチャーを奪い合う。→ 許可 → カメラ → 全画面を直列化し、activation が切れたら「タップで全画面表示」の **2 タップ目**に落とす
- **HTTPS**: `getUserMedia()`・センサー系は HTTP だと undefined / 拒否。`http://` で開いていないか
- **自己署名証明書**: basic-ssl は初回に警告の突破が要る（上記）
- **フルスクリーン**: 任意要素の `requestFullscreen()` は iPhone では **iOS 17.2 以降**。ユーザージェスチャー内で呼ぶ。上端からのスワイプで解除される（→ ボタン再表示 → 再タップ）。非対応環境は `100dvh` + `touch-action: none` でフォールバック
- **画面回転ロック**: `screen.orientation.lock()` は iOS Safari 非対応（`lock=unsupported`）。「横向きにしてください」の案内で代替
- **スリープ**: Wake Lock API（`navigator.wakeLock`、iOS 16.4+）。裏に回ると `released`、表に戻ったら取り直す
- **bfcache 復帰**: 戻る / タブ切り替えからの復帰でカメラ・ws が黙って死ぬ。`pageshow` / `visibilitychange` で取り直す
- **例外 1 回でループが止まる**: 装着中は原因も見えない。ループ内で例外を握って HUD に出し、次フレームへ進む
- **カメラ**: 超広角は `facingMode` では選べない（ラベルで選ぶ）。解像度を指定しないと 640x480。デバイス回転で映像自体が回転し縦横比補正が古くなる
- **熱**: 熱の状態を知る API がない。長時間の確認で落ちたら負荷（推論頻度・解像度）を疑う
- **console が見えない**: Mac の Safari → 開発メニューから USB 接続の iPhone を選び Web インスペクタで見る（iPhone 側で「Web インスペクタ」を有効化）。mobile-mr の `remote-log.ts` / `server/client-log.ts` の遠隔ログも使える

## Android Chrome で確認するときの違い

iOS Safari で通る導線が Chrome では「黙って」変わる（PAIN_POINTS 2026-09-02「全デモ共通 / start-flow」）。SDK の `core` はこの差を吸収する:

- **センサー許可**: ダイアログは出ない。最近の Chrome は互換のため `requestPermission()` を持ち即 `granted` を返す（古い Chrome には API 自体が無い）。ただしサイト設定の**モーションセンサー**がブロックだとイベントが黙って届かない → 3 秒以内にイベントが届いたかを HUD の `sensor=... events-ok / no-events` で見分ける
- **フルスクリーン**: 使える。初回はカメラ許可ダイアログで activation（Chrome は 5 秒）が切れて拒否されるので 2 タップ目に落ちる（iOS と同じ）。**全画面中は `screen.orientation.lock("landscape")` が使える**（HUD の `fs=ok lock=ok`）
- **iPhone の Chrome**: WebKit の制約で Fullscreen API 自体が無い（`fs=unsupported`）。Safari で開いてもらう
- **長押し**: 「押している間」の操作は `contextmenu` で切れるので抑止する
- **自己署名証明書**: 「詳細設定 → アクセスする（安全ではありません）」。突破後は同じホストの `wss://` も通る
- **カメラ**: ラベルに「超広角」が無いので標準カメラ扱い。見え方が合わなければ `?camFov=` で上書き
- **PC で再現**: `cd ../mobile-mr && npm run check:chrome-flow`（ヘッドレス Chrome でタッチ端末を模擬。pc-check スキル）

## HUD の表記を変えない

`sensor=` `fs=` `lock=` `wake=` などの HUD 文字列は、mobile-mr の `headless-*.mjs` が解析している。SDK 側で同じ状態を出すときは同じ表記にする（差し替え後もスクリプトがそのまま通る）。

## 関連

- 差し替えの全体手順は **swap-demo**、PC の自動確認は **pc-check**、痛点の記録は **pain-point**
- mobile-mr 側の詳しい版: `../mobile-mr/.claude/skills/iphone-test/SKILL.md`、`dev-address/SKILL.md`
