// ブラウザ API への唯一の出入口。Session はこの interface だけを見るので、Node のテストでは
// 偽物を渡して「許可が拒否された」「全画面化が activation 失効で落ちた」「bfcache から戻った」を再現できる。
// ブラウザごとの差（許可 API の有無・lock の可否・全 null のセンサーイベント）はここで吸収する。
// 参照: mobile-mr/src/shared/start-flow.ts、PAIN_POINTS「iOS で詰めた開始導線が Chrome では黙って変わる」

export type SensorPermission = "granted" | "denied";

export type WakeLockHandle = {
  release(): Promise<void>;
  onRelease(cb: () => void): void;
};

export type OrientationLockType = "landscape" | "portrait";

export interface Env {
  /** タッチ端末（= スマホ実機）か。`(pointer: coarse)` */
  readonly touch: boolean;
  /** undefined = 許可 API 自体が無い環境（古い Android Chrome / PC）。iOS はダイアログ、最近の Chrome は即 granted */
  readonly requestSensorPermission?: () => Promise<SensorPermission>;
  /**
   * deviceorientation が timeoutMs 内に実際に届いたら true。PC Chrome はセンサーが無いと
   * alpha/beta/gamma が全部 null のイベントを 1 回だけ発火するので、それは「届いた」に数えない
   */
  watchSensorEvents(timeoutMs: number): Promise<boolean>;
  /** undefined = Fullscreen API 非対応（iOS 17.2 未満） */
  readonly requestFullscreen?: () => Promise<void>;
  isFullscreen(): boolean;
  onFullscreenChange(cb: () => void): void;
  /** undefined = 非対応（iOS Safari）。Android Chrome は全画面中だけ成功する */
  readonly lockOrientation?: (type: OrientationLockType) => Promise<void>;
  /** undefined = Wake Lock 非対応 */
  readonly requestWakeLock?: () => Promise<WakeLockHandle>;
  onVisibilityChange(cb: (visible: boolean) => void): void;
  onPageHide(cb: () => void): void;
  /** persisted = bfcache からの復帰 */
  onPageShow(cb: (persisted: boolean) => void): void;
  /** 長押しの contextmenu（Android Chrome）を止める。target 省略時は document */
  suppressContextMenu(target?: EventTarget): void;
  now(): number;
  requestFrame(cb: (now: number) => void): number;
  cancelFrame(id: number): void;
}

/** 実際のブラウザに繋いだ Env。`createSession()` の既定 */
export function browserEnv(): Env {
  const doe =
    typeof DeviceOrientationEvent === "undefined"
      ? undefined
      : (DeviceOrientationEvent as unknown as {
          requestPermission?: () => Promise<SensorPermission>;
        });
  const orientation = (typeof screen === "undefined" ? undefined : screen.orientation) as
    | (ScreenOrientation & { lock?: (type: string) => Promise<void> })
    | undefined;
  const root = document.documentElement;

  return {
    touch: matchMedia("(pointer: coarse)").matches,
    requestSensorPermission:
      doe && typeof doe.requestPermission === "function"
        ? () => doe.requestPermission!.call(doe)
        : undefined,
    watchSensorEvents(timeoutMs) {
      return new Promise((resolve) => {
        const onEvent = (e: DeviceOrientationEvent) => {
          if (e.alpha === null && e.beta === null && e.gamma === null) return;
          clearTimeout(timer);
          removeEventListener("deviceorientation", onEvent);
          resolve(true);
        };
        const timer = setTimeout(() => {
          removeEventListener("deviceorientation", onEvent);
          resolve(false);
        }, timeoutMs);
        addEventListener("deviceorientation", onEvent);
      });
    },
    requestFullscreen: root.requestFullscreen ? () => root.requestFullscreen() : undefined,
    isFullscreen: () => Boolean(document.fullscreenElement),
    onFullscreenChange: (cb) => document.addEventListener("fullscreenchange", cb),
    lockOrientation:
      orientation && typeof orientation.lock === "function"
        ? (type) => orientation.lock!(type)
        : undefined,
    requestWakeLock:
      "wakeLock" in navigator
        ? async () => {
            const sentinel = await navigator.wakeLock.request("screen");
            return {
              release: () => sentinel.release(),
              onRelease: (cb) => sentinel.addEventListener("release", cb),
            };
          }
        : undefined,
    onVisibilityChange: (cb) =>
      document.addEventListener("visibilitychange", () =>
        cb(document.visibilityState === "visible"),
      ),
    onPageHide: (cb) => addEventListener("pagehide", () => cb()),
    onPageShow: (cb) => addEventListener("pageshow", (e) => cb(e.persisted)),
    suppressContextMenu: (target = document) =>
      target.addEventListener("contextmenu", (e) => e.preventDefault()),
    now: () => performance.now(),
    requestFrame: (cb) => requestAnimationFrame(cb),
    cancelFrame: (id) => cancelAnimationFrame(id),
  };
}
