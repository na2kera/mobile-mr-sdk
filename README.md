# Mobile MR SDK

スマートフォン + スマホ用 VR ゴーグルで、ブラウザだけで動くマルチプレイヤー MR 基盤のライブラリ。
[mobile-mr](../mobile-mr) の Phase 1〜10-2（段階 1）で貯めた実装と痛点を「参照実装 + 要求仕様」として、
コア部分（頭追従・ステレオ描画・許可フロー・マーカー座標系・Room 同期）を既存ライブラリのラップではなく自力実装する。

- 構想と 4 段階戦略: `../mobile-mr/docs/CONCEPT.md`（§6 SDK 構成案・§7 API イメージ・Phase 11）
- 要求仕様の元: `../mobile-mr/docs/PAIN_POINTS.md`

## ディレクトリ

```text
mobile-mr-project/
├─ mobile-mr/      段階 1 の参照実装（デモ群）
└─ mobile-mr-sdk/  このリポジトリ（段階 2）
```
