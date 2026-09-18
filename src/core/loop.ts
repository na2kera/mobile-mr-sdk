// フレームループ。登録した処理を 1 つずつ例外から隔離して回す。
// three の setAnimationLoop はコールバックが throw すると次のフレームを予約しないので、
// 推論 1 回の失敗で背景・頭追従・HUD がまとめて凍る（PAIN_POINTS「例外 1 回でアニメーションループが止まり、
// 装着中は原因も見えない」）。失敗は "error" として通知し、描画は続ける。
// フレーム時間の計測は熱制限の間接検知の土台（PAIN_POINTS「スマホがかなり熱くなる」。ノブは後）

import type { Env } from "./env.js";
import { errorText } from "./events.js";

export type FrameFn = (dtMs: number, nowMs: number) => void;

export type LoopStats = {
  /** 直近フレームの間隔（ms） */
  lastDtMs: number;
  /** フレーム間隔の指数移動平均（ms） */
  frameMs: number;
  frames: number;
  /** 直近に失敗した処理 → エラー文字列。成功したら消える */
  errors: Record<string, string>;
};

/** kind = どこで起きたか。name は "resume:camera" のように prefix 付きのままにしてある（HUD の表示互換） */
export type LoopError = {
  kind: "loop" | "resume" | "suspend" | "sensor";
  /** loop なら登録名、それ以外は "resume:camera" のような prefix 付きの名前 */
  name: string;
  error: unknown;
  text: string;
};

export type Loop = {
  /** 同名は置き換え。登録順に呼ぶ */
  add(name: string, fn: FrameFn): void;
  remove(name: string): void;
  start(): void;
  stop(): void;
  readonly running: boolean;
  readonly stats: LoopStats;
};

export function createLoop(env: Env, onError: (e: LoopError) => void): Loop {
  const fns = new Map<string, FrameFn>();
  const stats: LoopStats = { lastDtMs: 0, frameMs: 0, frames: 0, errors: {} };
  let frameId: number | null = null;
  let lastNow: number | null = null;

  const tick = (now: number) => {
    frameId = env.requestFrame(tick);
    const dt = lastNow === null ? 0 : now - lastNow;
    lastNow = now;
    stats.lastDtMs = dt;
    stats.frameMs = stats.frames === 0 ? dt : stats.frameMs * 0.9 + dt * 0.1;
    stats.frames++;
    for (const [name, fn] of fns) {
      try {
        fn(dt, now);
        if (name in stats.errors) delete stats.errors[name];
      } catch (error) {
        const text = errorText(error);
        // 毎フレーム同じ失敗を繰り返す処理で通知が洪水にならないよう、内容が変わったときだけ通知する
        if (stats.errors[name] !== text) {
          stats.errors[name] = text;
          onError({ kind: "loop", name, error, text });
        }
      }
    }
  };

  return {
    add: (name, fn) => {
      fns.set(name, fn);
    },
    remove: (name) => {
      fns.delete(name);
      delete stats.errors[name];
    },
    start() {
      if (frameId !== null) return;
      lastNow = null;
      frameId = env.requestFrame(tick);
    },
    stop() {
      if (frameId === null) return;
      env.cancelFrame(frameId);
      frameId = null;
    },
    get running() {
      return frameId !== null;
    },
    stats,
  };
}
