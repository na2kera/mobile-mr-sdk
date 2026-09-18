// mobile-mr-sdk/core — Session（開始フロー・ライフサイクル・フレームループ）と設定（URL パラメータ・端末プロファイル）
export { createSession } from "./session.js";
export type {
  Session,
  SessionOptions,
  SessionState,
  SessionEvents,
  StartOptions,
  SensorState,
  FullscreenState,
  Outcome,
  Failure,
  Resource,
  ResumeContext,
} from "./session.js";
// Env / browserEnv / createLoop は**差し替えとテスト用**（`createSession({ env })` に偽物を渡す経路と、
// Session を使わずループだけ要る場合）。通常の利用では触らなくてよい
export { browserEnv } from "./env.js";
export type { Env, SensorPermission, WakeLockHandle, OrientationLockType } from "./env.js";
export { createLoop } from "./loop.js";
export type { Loop, LoopStats, LoopError, FrameFn } from "./loop.js";
// createParamRegistry / createProfile は **06 の差し替えで接続する**（パラメータ名の衝突検出・較正値の保存）。
// それまで利用者はいない
export { readNumber, readResolution, readFlag, createParamRegistry } from "./params.js";
export type { NumberRange, ParamRegistry } from "./params.js";
export { createProfile } from "./profile.js";
export type { Profile, ProfileStorage } from "./profile.js";
export { errorText } from "./events.js";
