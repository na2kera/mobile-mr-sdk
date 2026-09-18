// Session: 開始フロー + ライフサイクル + フレームループ。
// 「開始ジェスチャー（タップ）は 1 回しか使えない希少資源」が中心概念。
// 参照実装: mobile-mr/src/shared/start-flow.ts（runStartFlow / setupFullscreen / keepScreenAwake）と
// mobile-mr/demos/01-stereo-box/main.ts の開始フロー。順序の根拠は PAIN_POINTS の
//   「全画面遷移中はセンサー許可ダイアログが出ない（1 タップに同居できない）」
//   「開始ジェスチャーの奪い合いにカメラ許可が 3 人目として参加」
// 要点:
//   - iOS はセンサー許可がユーザージェスチャー起点でないと出ない
//   - 全画面遷移中は許可ダイアログが出ないので、ダイアログ系（センサー → カメラ）を先に直列で済ませ、
//     最後に全画面化を試みる。初回は activation が切れて全画面化が拒否されるので "needs-tap" を返し、
//     利用側が「タップで全画面表示」ボタン（2 タップ目）を出す。上端スワイプで解除されたときも同じ状態にする
//   - 結果は「許可の有無」ではなく「センサーが実際に届いたか」「全画面・横向き固定・Wake Lock のそれぞれ」で返す
//     （Chrome は許可ダイアログが無く granted のままイベントが届かないことがある）
// core は DOM（ボタン・オーバーレイ・HUD）を持たない。状態を返すだけで、表示は利用側が決める

import { browserEnv, type Env, type OrientationLockType, type WakeLockHandle } from "./env.js";
import { createEmitter, errorText } from "./events.js";
import { createLoop, type Loop, type LoopError } from "./loop.js";

export type Failure = { error: string };
export type Outcome = "ok" | "unsupported" | "skipped" | Failure;

export type SensorState = {
  /** iOS: ダイアログの結果。Chrome: 即 granted。API が無ければ "no-api"。PC / sensors:false は "skipped" */
  permission: "pending" | "granted" | "denied" | "no-api" | "skipped" | Failure;
  /** 許可のあと deviceorientation が実際に届いたか（3 秒監視）。届かなければ "none"（Chrome のサイト設定でブロック等） */
  events: "pending" | "ok" | "none" | "skipped";
};

/** "needs-tap" = ジェスチャーが要る（初回の activation 失効・解除後の再入）。利用側はこのときだけボタンを出す */
export type FullscreenState = "pending" | "ok" | "unsupported" | "skipped" | "needs-tap";

export type SessionState = {
  readonly touch: boolean;
  started: boolean;
  sensor: SensorState;
  camera: "pending" | Outcome;
  fullscreen: FullscreenState;
  /** fullscreen が "needs-tap" になった原因（HUD 用） */
  fullscreenError?: string;
  orientation: "pending" | Outcome;
  wakeLock: "pending" | "released" | Outcome;
  inFullscreen: boolean;
  /** pagehide で畳んだまま（bfcache に入っている / 復帰前） */
  suspended: boolean;
  /** bfcache 復帰後、再開にジェスチャーが要るリソース名。`resume()` をタップ内で呼ぶ */
  pendingResume: string[];
};

export type StartOptions = {
  /** DeviceOrientation の許可を取る。既定 true */
  sensors?: boolean;
  /** カメラを開始する関数（camera モジュール or 利用側）。許可ダイアログ系なのでセンサーの直後・全画面化の前に呼ぶ */
  camera?: () => Promise<void>;
  /** 既定 true。センサー許可が拒否されたときは頭追従が無いので試みない（"skipped"） */
  fullscreen?: boolean;
  /** 全画面化に成功したあと試みる（Android Chrome）。既定 "landscape"。false で試みない */
  orientationLock?: OrientationLockType | false;
  /** 画面の消灯を防ぐ。既定 true */
  wakeLock?: boolean;
  /** 長押しの contextmenu を止める。既定 true（document）。要素を渡すとその要素だけ */
  suppressContextMenu?: boolean | EventTarget;
};

export type ResumeContext = { inGesture: boolean };

export type Resource = {
  suspend(): void;
  /** "needs-gesture" を返すと pendingResume に載り、`session.resume()`（ジェスチャー内）で再度呼ばれる */
  resume(ctx: ResumeContext): Promise<"ok" | "needs-gesture"> | "ok" | "needs-gesture";
};

export type SessionEvents = {
  change: SessionState;
  /** 許可フローが決着した（granted / denied / no-api / エラー）。頭追従はこのタイミングで始める */
  sensor: SensorState;
  error: LoopError;
};

export type Session = {
  readonly state: SessionState;
  readonly touch: boolean;
  /** 開始ボタンのクリックハンドラ内で呼ぶ（ユーザージェスチャー必須）。1 回だけ */
  start(options?: StartOptions): Promise<SessionState>;
  /** 2 タップ目・解除後の再入。ジェスチャー内で呼ぶ */
  enterFullscreen(): Promise<void>;
  /** pendingResume のリソースを再開する。ジェスチャー内で呼ぶ */
  resume(): Promise<void>;
  lifecycle: {
    register(name: string, resource: Resource): () => void;
  };
  loop: Loop;
  on<K extends keyof SessionEvents>(event: K, listener: (payload: SessionEvents[K]) => void): () => void;
};

export type SessionOptions = {
  env?: Env;
  /** センサーイベントを待つ時間（ms）。既定 3000 */
  sensorWatchMs?: number;
};

const failure = (e: unknown): Failure => ({ error: errorText(e) });

export function createSession(options: SessionOptions = {}): Session {
  const env = options.env ?? browserEnv();
  const sensorWatchMs = options.sensorWatchMs ?? 3000;
  const emitter = createEmitter<SessionEvents>();

  const state: SessionState = {
    touch: env.touch,
    started: false,
    sensor: { permission: "pending", events: "pending" },
    camera: "pending",
    fullscreen: "pending",
    orientation: "pending",
    wakeLock: "pending",
    inFullscreen: env.isFullscreen(),
    suspended: false,
    pendingResume: [],
  };
  const changed = () => emitter.emit("change", state);

  type ResolvedStart = {
    sensors: boolean;
    camera?: () => Promise<void>;
    fullscreen: boolean;
    orientationLock: OrientationLockType | false;
    wakeLock: boolean;
  };
  let startOptions: ResolvedStart | null = null;
  let wakeHandle: WakeLockHandle | null = null;

  // ---- 全画面 ----
  const lockOrientation = async () => {
    const type = startOptions?.orientationLock;
    if (!type || !env.touch) {
      state.orientation = "skipped";
    } else if (!env.lockOrientation) {
      state.orientation = "unsupported";
    } else {
      try {
        await env.lockOrientation(type);
        state.orientation = "ok";
      } catch (e) {
        state.orientation = failure(e);
      }
    }
    changed();
  };

  const enterFullscreen = async () => {
    if (!env.requestFullscreen) {
      state.fullscreen = "unsupported";
      state.orientation = "skipped";
      changed();
      return;
    }
    try {
      await env.requestFullscreen();
      state.fullscreen = "ok";
      delete state.fullscreenError;
      changed();
      // 横向き固定は全画面中しか許可されない（Android Chrome）ので成功後に続けて試みる
      await lockOrientation();
    } catch (e) {
      // 初回はダイアログ操作で activation が切れて拒否される。再タップで通る
      state.fullscreen = "needs-tap";
      state.fullscreenError = errorText(e);
      changed();
    }
  };

  env.onFullscreenChange(() => {
    state.inFullscreen = env.isFullscreen();
    if (state.inFullscreen) {
      state.fullscreen = "ok";
      delete state.fullscreenError;
    } else if (state.started && env.touch && state.fullscreen === "ok") {
      // 上端スワイプ等で解除された。再入導線を出す
      state.fullscreen = "needs-tap";
    }
    changed();
  });

  // ---- Wake Lock ----
  const acquireWakeLock = async () => {
    if (!env.requestWakeLock) {
      state.wakeLock = "unsupported";
      changed();
      return;
    }
    try {
      wakeHandle = await env.requestWakeLock();
      state.wakeLock = "ok";
      wakeHandle.onRelease(() => {
        state.wakeLock = "released";
        changed();
      });
    } catch (e) {
      state.wakeLock = failure(e);
    }
    changed();
  };

  env.onVisibilityChange((visible) => {
    // タブが裏に回ると解放されるので、表に戻ったとき取り直す
    if (visible && startOptions?.wakeLock && state.wakeLock === "released") void acquireWakeLock();
  });

  // ---- フレームループ ----
  const loop = createLoop(env, (e) => emitter.emit("error", e));
  /** pagehide の時点でループが回っていたか（bfcache 復帰でそのぶんだけ回し直す） */
  let loopWasRunning = false;

  // ---- ライフサイクル ----
  const resources = new Map<string, Resource>();
  const resumeAll = async (inGesture: boolean) => {
    const pending: string[] = [];
    for (const [name, resource] of resources) {
      if (inGesture && !state.pendingResume.includes(name)) continue;
      try {
        if ((await resource.resume({ inGesture })) === "needs-gesture") pending.push(name);
      } catch (error) {
        emitter.emit("error", { name: `resume:${name}`, error, text: errorText(error) });
        pending.push(name);
      }
    }
    state.pendingResume = pending;
    changed();
  };

  env.onPageHide(() => {
    // bfcache に退避されるとき、予約済みの requestAnimationFrame を捨てるブラウザがある。
    // 止め直さないと loop.running が true のままで、復帰後 loop.start() が早期 return して描画が戻らない
    loopWasRunning = loop.running;
    if (loopWasRunning) loop.stop();
    state.suspended = true;
    for (const [name, resource] of resources) {
      try {
        resource.suspend();
      } catch (error) {
        emitter.emit("error", { name: `suspend:${name}`, error, text: errorText(error) });
      }
    }
    changed();
  });

  env.onPageShow((persisted) => {
    if (!persisted) return;
    // ループの復帰は started に依存させない。01 はループを開始ボタンより前に回している。
    // loop.start() は lastNow をリセットするので、復帰直後の dt が退避時間ぶん跳ねない
    if (loopWasRunning) {
      loopWasRunning = false;
      loop.start();
    }
    if (!state.started) return;
    state.suspended = false;
    void resumeAll(false);
  });

  // ---- 開始フロー ----
  const runCamera = async () => {
    if (!startOptions?.camera) {
      state.camera = "skipped";
    } else {
      try {
        await startOptions.camera();
        state.camera = "ok";
      } catch (e) {
        state.camera = failure(e);
      }
    }
    changed();
  };

  const settleSensor = (permission: SensorState["permission"]) => {
    state.sensor.permission = permission;
    const usable = permission === "granted" || permission === "no-api";
    state.sensor.events = usable ? "pending" : "skipped";
    emitter.emit("sensor", state.sensor);
    changed();
    if (usable) {
      // 監視自体が失敗したときも events を pending のまま残さない（残ると利用側は永久に待つ）。
      // 「届かなかった」= "none" に倒し、理由は error イベントで出す
      void env.watchSensorEvents(sensorWatchMs).then(
        (ok) => {
          state.sensor.events = ok ? "ok" : "none";
          changed();
        },
        (error: unknown) => {
          state.sensor.events = "none";
          emitter.emit("error", { name: "sensor:watch", error, text: errorText(error) });
          changed();
        },
      );
    }
    return usable;
  };

  const start = async (opts: StartOptions = {}) => {
    if (state.started) throw new Error("session.start() は 1 回しか呼べない");
    state.started = true;
    startOptions = {
      sensors: opts.sensors ?? true,
      camera: opts.camera,
      fullscreen: opts.fullscreen ?? true,
      orientationLock: opts.orientationLock ?? "landscape",
      wakeLock: opts.wakeLock ?? true,
    };
    const contextMenu = opts.suppressContextMenu ?? true;

    // PC（マウス）はデバッグ用途: 許可・全画面・Wake Lock を飛ばしてカメラだけ
    if (!env.touch) {
      state.sensor = { permission: "skipped", events: "skipped" };
      emitter.emit("sensor", state.sensor);
      state.fullscreen = "skipped";
      state.orientation = "skipped";
      state.wakeLock = "skipped";
      changed();
      await runCamera();
      return state;
    }

    if (contextMenu) env.suppressContextMenu(contextMenu === true ? undefined : contextMenu);
    if (startOptions.wakeLock) void acquireWakeLock();
    else state.wakeLock = "skipped";

    let headUsable: boolean;
    if (!startOptions.sensors) {
      state.sensor = { permission: "skipped", events: "skipped" };
      emitter.emit("sensor", state.sensor);
      changed();
      headUsable = true;
    } else if (!env.requestSensorPermission) {
      headUsable = settleSensor("no-api");
    } else {
      let permission: SensorState["permission"];
      try {
        permission = await env.requestSensorPermission();
      } catch (e) {
        permission = failure(e);
      }
      headUsable = settleSensor(permission);
    }

    await runCamera();

    if (startOptions.fullscreen && headUsable) {
      await enterFullscreen();
    } else {
      state.fullscreen = "skipped";
      state.orientation = "skipped";
      changed();
    }
    return state;
  };

  return {
    state,
    touch: env.touch,
    start,
    enterFullscreen,
    resume: () => resumeAll(true),
    lifecycle: {
      register(name, resource) {
        resources.set(name, resource);
        return () => {
          resources.delete(name);
        };
      },
    },
    loop,
    on: (event, listener) => emitter.on(event, listener),
  };
}
