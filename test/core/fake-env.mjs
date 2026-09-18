// テスト用の偽 Env。ブラウザの挙動（iOS のダイアログ、Chrome の即 granted、activation 失効、bfcache）を
// フラグで再現し、呼ばれた順序を calls に記録する

export function fakeEnv(overrides = {}) {
  const calls = [];
  const handlers = { fullscreen: [], visibility: [], pagehide: [], pageshow: [] };
  let fullscreen = false;
  let frameCallbacks = new Map();
  let frameSeq = 0;
  let now = 0;
  const wakeReleaseCbs = [];

  const env = {
    touch: true,
    // 既定は iOS 相当: ダイアログで granted、イベントも届く
    requestSensorPermission: async () => {
      calls.push("sensor");
      return "granted";
    },
    watchSensorEvents: async () => {
      calls.push("watch");
      return true;
    },
    requestFullscreen: async () => {
      calls.push("fullscreen");
      fullscreen = true;
    },
    isFullscreen: () => fullscreen,
    onFullscreenChange: (cb) => handlers.fullscreen.push(cb),
    lockOrientation: async (type) => {
      calls.push(`lock:${type}`);
    },
    requestWakeLock: async () => {
      calls.push("wake");
      return {
        release: async () => {},
        onRelease: (cb) => wakeReleaseCbs.push(cb),
      };
    },
    onVisibilityChange: (cb) => handlers.visibility.push(cb),
    onPageHide: (cb) => handlers.pagehide.push(cb),
    onPageShow: (cb) => handlers.pageshow.push(cb),
    suppressContextMenu: () => {
      calls.push("contextmenu");
    },
    now: () => now,
    requestFrame: (cb) => {
      const id = ++frameSeq;
      frameCallbacks.set(id, cb);
      return id;
    },
    cancelFrame: (id) => {
      frameCallbacks.delete(id);
    },
    ...overrides,
    // ---- テストから挙動を起こす ----
    calls,
    setFullscreen(value) {
      fullscreen = value;
      for (const cb of handlers.fullscreen) cb();
    },
    setVisible(visible) {
      for (const cb of handlers.visibility) cb(visible);
    },
    pageHide() {
      for (const cb of handlers.pagehide) cb();
    },
    pageShow(persisted) {
      for (const cb of handlers.pageshow) cb(persisted);
    },
    releaseWakeLock() {
      for (const cb of wakeReleaseCbs) cb();
    },
    /** 予約されたフレームを 1 つ進める */
    frame(dt = 16) {
      now += dt;
      const pending = frameCallbacks;
      frameCallbacks = new Map();
      for (const cb of pending.values()) cb(now);
    },
    get pendingFrames() {
      return frameCallbacks.size;
    },
  };
  return env;
}

/** マイクロタスクを掃く（await の連鎖を進める） */
export const flush = () => new Promise((r) => setTimeout(r, 0));
