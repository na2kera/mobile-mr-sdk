// src/core/session.ts（開始フロー・全画面の再入・Wake Lock・ライフサイクル）の回帰テスト。`npm test` で実行する。
// 検証しているもの / していないもの:
//   - 検証済み: 順序（contextmenu 抑止 → Wake Lock → センサー許可 → イベント監視 → カメラ → 全画面 → 横向き固定）、
//     iOS 初回（activation 失効 → needs-tap → 2 タップ目で ok）、拒否・API 無し・非対応の各分岐、解除後の再入、
//     bfcache 復帰の suspend / resume と needs-gesture、リスナーや resume の例外で止まらないこと
//   - 未検証（仮定）: 実ブラウザの挙動そのもの（iOS が全画面遷移中にダイアログを繰り延べること、Chrome が即 granted を返すこと、
//     Wake Lock が裏で解放されること）。これは fake-env.mjs の仮定で、実機（swap-demo の確認項目）で確かめる
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../../dist/core/index.js";
import { fakeEnv, flush } from "./fake-env.mjs";

const failing = (msg) => async () => {
  throw new DOMException(msg, "NotAllowedError");
};

test("PC（マウス）: 許可・全画面・Wake Lock を飛ばし、カメラだけ呼ぶ", async () => {
  const env = fakeEnv({ touch: false });
  let cameraCalled = 0;
  const session = createSession({ env });
  const state = await session.start({ camera: async () => void cameraCalled++ });
  assert.equal(cameraCalled, 1);
  assert.deepEqual(state.sensor, { permission: "skipped", events: "skipped", usable: true });
  assert.equal(state.camera, "ok");
  assert.equal(state.fullscreen, "skipped");
  assert.equal(state.wakeLock, "skipped");
  assert.deepEqual(env.calls, []);
});

test("iOS 許可済み（リピーター）: センサー → カメラ → 全画面 → 横向き固定の順で 1 タップで完結", async () => {
  const env = fakeEnv();
  const session = createSession({ env });
  const state = await session.start({
    camera: async () => void env.calls.push("camera"),
  });
  assert.deepEqual(env.calls, ["contextmenu", "wake", "sensor", "watch", "camera", "fullscreen", "lock:landscape"]);
  assert.equal(state.sensor.permission, "granted");
  assert.equal(state.camera, "ok");
  assert.equal(state.fullscreen, "ok");
  assert.equal(state.orientation, "ok");
  await flush();
  assert.equal(state.sensor.events, "ok");
  assert.equal(state.wakeLock, "ok");
});

test("iOS 初回: ダイアログで activation が切れて全画面化が拒否 → needs-tap → 2 タップ目で ok", async () => {
  const env = fakeEnv({ requestFullscreen: failing("activation expired") });
  const session = createSession({ env });
  const changes = [];
  session.on("change", (s) => changes.push(s.fullscreen));
  const state = await session.start();
  assert.equal(state.fullscreen, "needs-tap");
  assert.match(state.fullscreenError, /NotAllowedError/);
  assert.equal(state.orientation, "pending", "全画面化に失敗したら横向き固定は試みない");

  // 2 タップ目（利用側のボタン）
  env.requestFullscreen = async () => env.setFullscreen(true);
  await session.enterFullscreen();
  assert.equal(state.fullscreen, "ok");
  assert.equal(state.fullscreenError, undefined);
  assert.equal(state.orientation, "ok");
  assert.ok(changes.includes("needs-tap"));
});

test("iOS 拒否: カメラは呼ぶが全画面は skipped。sensor イベントで拒否を観測できる", async () => {
  const env = fakeEnv({ requestSensorPermission: async () => "denied" });
  const session = createSession({ env });
  let sensorEvent = null;
  session.on("sensor", (s) => (sensorEvent = { ...s }));
  let cameraCalled = 0;
  const state = await session.start({ camera: async () => void cameraCalled++ });
  assert.equal(sensorEvent.permission, "denied");
  assert.equal(state.sensor.events, "skipped");
  assert.equal(cameraCalled, 1);
  assert.equal(state.fullscreen, "skipped");
  assert.ok(!env.calls.includes("fullscreen"));
  assert.ok(!env.calls.includes("watch"));
});

test("許可 API が throw: エラーとして返し、カメラは続ける", async () => {
  const env = fakeEnv({
    requestSensorPermission: async () => {
      throw new Error("boom");
    },
  });
  const session = createSession({ env });
  const state = await session.start({ camera: async () => {} });
  assert.deepEqual(state.sensor.permission, { error: "Error: boom" });
  assert.equal(state.camera, "ok");
  assert.equal(state.fullscreen, "skipped");
});

test("Android Chrome 相当: 許可 API なし → no-api、イベントが届かなければ none。lock / wake は取れる", async () => {
  const env = fakeEnv({
    requestSensorPermission: undefined,
    watchSensorEvents: async () => false,
  });
  const session = createSession({ env });
  const state = await session.start();
  assert.equal(state.sensor.permission, "no-api");
  assert.equal(state.fullscreen, "ok");
  assert.equal(state.orientation, "ok");
  await flush();
  assert.equal(state.sensor.events, "none");
  assert.equal(state.wakeLock, "ok");
});

test("センサーイベントの監視が失敗: events=none に倒し、error イベントで理由を出す", async () => {
  const env = fakeEnv({
    watchSensorEvents: async () => {
      throw new Error("boom");
    },
  });
  const session = createSession({ env });
  const errors = [];
  session.on("error", (e) => errors.push(e));
  const state = await session.start();
  await flush();
  assert.equal(state.sensor.events, "none", "pending のまま残さない");
  assert.equal(errors.length, 1);
  assert.equal(errors[0].name, "sensor:watch");
  assert.equal(errors[0].text, "Error: boom");
});

test("非対応の環境: Fullscreen / lock / Wake Lock が無ければ unsupported", async () => {
  const env = fakeEnv({
    requestFullscreen: undefined,
    lockOrientation: undefined,
    requestWakeLock: undefined,
  });
  const session = createSession({ env });
  const state = await session.start();
  assert.equal(state.fullscreen, "unsupported");
  assert.equal(state.wakeLock, "unsupported");
  assert.equal(state.orientation, "skipped");
});

test("横向き固定が非対応（iOS）なら orientation は unsupported、全画面は ok のまま", async () => {
  const env = fakeEnv({ lockOrientation: undefined });
  const session = createSession({ env });
  const state = await session.start();
  assert.equal(state.fullscreen, "ok");
  assert.equal(state.orientation, "unsupported");
});

test("カメラが失敗しても全画面化は続ける", async () => {
  const env = fakeEnv();
  const session = createSession({ env });
  const state = await session.start({
    camera: async () => {
      throw new DOMException("denied", "NotAllowedError");
    },
  });
  assert.deepEqual(state.camera, { error: "NotAllowedError: denied" });
  assert.equal(state.fullscreen, "ok");
});

test("start() は 1 回だけ", async () => {
  const session = createSession({ env: fakeEnv() });
  await session.start();
  await assert.rejects(() => session.start(), /1 回/);
});

test("オプション: sensors / fullscreen / wakeLock / orientationLock / suppressContextMenu を切れる", async () => {
  const env = fakeEnv();
  const session = createSession({ env });
  const state = await session.start({
    sensors: false,
    fullscreen: false,
    wakeLock: false,
    orientationLock: false,
    suppressContextMenu: false,
  });
  assert.deepEqual(env.calls, []);
  assert.deepEqual(state.sensor, { permission: "skipped", events: "skipped", usable: true });
  assert.equal(state.fullscreen, "skipped");
  assert.equal(state.wakeLock, "skipped");
});

test("sensors:false でも全画面化はする（センサー無しの用途）", async () => {
  const env = fakeEnv();
  const session = createSession({ env });
  const state = await session.start({ sensors: false });
  assert.equal(state.fullscreen, "ok");
  assert.ok(!env.calls.includes("sensor"));
});

test("sensor.usable: 頭追従を始めてよいかの規則を core が持つ", async () => {
  // granted（iOS 許可済み）
  const granted = createSession({ env: fakeEnv() });
  assert.equal(granted.state.sensor.usable, false, "start() の前は false");
  assert.equal((await granted.start()).sensor.usable, true);

  // no-api（Android Chrome）— イベントが届かなくても「始めてよい」は true のまま
  const noApi = createSession({
    env: fakeEnv({ requestSensorPermission: undefined, watchSensorEvents: async () => false }),
  });
  const noApiState = await noApi.start();
  assert.equal(noApiState.sensor.usable, true);
  await flush();
  assert.equal(noApiState.sensor.events, "none");
  assert.equal(noApiState.sensor.usable, true);

  // denied
  const denied = createSession({ env: fakeEnv({ requestSensorPermission: async () => "denied" }) });
  assert.equal((await denied.start()).sensor.usable, false);

  // 許可 API が throw
  const broken = createSession({
    env: fakeEnv({
      requestSensorPermission: async () => {
        throw new Error("boom");
      },
    }),
  });
  assert.equal((await broken.start()).sensor.usable, false);

  // sensors:false（許可を取らないが頭追従はする）
  const skipped = createSession({ env: fakeEnv() });
  assert.equal((await skipped.start({ sensors: false })).sensor.usable, true);

  // PC（マウス）
  const pc = createSession({ env: fakeEnv({ touch: false }) });
  assert.equal((await pc.start()).sensor.usable, true);
});

test("sensor イベントの時点で usable が決まっている（利用側はこれだけ見て開始できる）", async () => {
  const env = fakeEnv({ requestSensorPermission: async () => "denied" });
  const session = createSession({ env });
  const seen = [];
  session.on("sensor", (s) => seen.push(s.usable));
  await session.start();
  assert.deepEqual(seen, [false]);
});

test("全画面の解除（上端スワイプ）→ needs-tap、再入で ok。開始前の変化では出さない", async () => {
  const env = fakeEnv();
  const session = createSession({ env });
  env.setFullscreen(false);
  assert.equal(session.state.fullscreen, "pending");
  await session.start();
  env.setFullscreen(true);
  assert.equal(session.state.inFullscreen, true);
  env.setFullscreen(false);
  assert.equal(session.state.fullscreen, "needs-tap");
  env.setFullscreen(true);
  assert.equal(session.state.fullscreen, "ok");
});

test("Wake Lock: 裏に回って解放 → released、表に戻ったら取り直す", async () => {
  const env = fakeEnv();
  const session = createSession({ env });
  await session.start();
  await flush();
  assert.equal(session.state.wakeLock, "ok");
  env.releaseWakeLock();
  assert.equal(session.state.wakeLock, "released");
  env.setVisible(true);
  await flush();
  assert.equal(session.state.wakeLock, "ok");
  assert.equal(env.calls.filter((c) => c === "wake").length, 2);
});

test("ライフサイクル: pagehide で suspend、bfcache 復帰で resume、ジェスチャーが要るものは pendingResume", async () => {
  const env = fakeEnv();
  const session = createSession({ env });
  const log = [];
  session.lifecycle.register("net", {
    suspend: () => log.push("net:suspend"),
    resume: ({ inGesture }) => {
      log.push(`net:resume:${inGesture}`);
      return "ok";
    },
  });
  session.lifecycle.register("camera", {
    suspend: () => log.push("camera:suspend"),
    resume: async ({ inGesture }) => {
      log.push(`camera:resume:${inGesture}`);
      return inGesture ? "ok" : "needs-gesture";
    },
  });
  // 開始前の pageshow は無視
  env.pageShow(true);
  assert.deepEqual(log, []);

  await session.start();
  env.pageHide();
  assert.equal(session.state.suspended, true);
  assert.deepEqual(log, ["net:suspend", "camera:suspend"]);

  env.pageShow(false); // 通常のロードは無視
  env.pageShow(true);
  await flush();
  assert.equal(session.state.suspended, false);
  assert.deepEqual(session.state.pendingResume, ["camera"]);
  assert.deepEqual(log.slice(2), ["net:resume:false", "camera:resume:false"]);

  // タップで再開: pending のものだけ呼ぶ
  await session.resume();
  assert.deepEqual(session.state.pendingResume, []);
  assert.deepEqual(log.slice(4), ["camera:resume:true"]);
});

test("ライフサイクル: pagehide でループを止め、bfcache 復帰で回し直す（dt は跳ねない）", async () => {
  const env = fakeEnv();
  const session = createSession({ env });
  session.loop.add("box", () => {});
  session.loop.start();
  env.frame(16);
  assert.equal(session.loop.running, true);
  assert.equal(env.pendingFrames, 1);

  env.pageHide();
  assert.equal(session.loop.running, false, "予約済みフレームを捨てるブラウザに備えて止め直す");
  assert.equal(env.pendingFrames, 0);

  env.pageShow(true);
  assert.equal(session.loop.running, true);
  assert.equal(env.pendingFrames, 1);
  env.frame(5000); // 退避していた時間ぶん now が飛ぶ
  assert.equal(session.loop.stats.lastDtMs, 0, "復帰直後の dt は退避時間ぶん跳ねない");
});

test("ライフサイクル: 開始前でもループの復帰はする。通常のロード（persisted=false）では何もしない", async () => {
  const env = fakeEnv();
  const session = createSession({ env });
  session.loop.start(); // start() より前にループを回す（01 と同じ形）
  env.pageHide();
  assert.equal(session.loop.running, false);
  env.pageShow(true);
  assert.equal(session.loop.running, true, "started に依存させない");

  // 止まっていたループは復帰で勝手に動き出さない
  const env2 = fakeEnv();
  const session2 = createSession({ env: env2 });
  env2.pageHide();
  env2.pageShow(true);
  assert.equal(session2.loop.running, false);

  // persisted=false（通常のロード）ではループに触らない
  const env3 = fakeEnv();
  const session3 = createSession({ env: env3 });
  session3.loop.start();
  env3.pageHide();
  env3.pageShow(false);
  assert.equal(session3.loop.running, false);
});

test("ライフサイクル: resume が throw しても他を止めず、error イベント + pending に残す", async () => {
  const env = fakeEnv();
  const session = createSession({ env });
  const errors = [];
  session.on("error", (e) => errors.push(e.name));
  session.lifecycle.register("a", {
    suspend() {},
    resume: () => {
      throw new Error("x");
    },
  });
  let bResumed = false;
  session.lifecycle.register("b", {
    suspend() {},
    resume: () => {
      bResumed = true;
      return "ok";
    },
  });
  await session.start();
  env.pageHide();
  env.pageShow(true);
  await flush();
  assert.deepEqual(errors, ["resume:a"]);
  assert.ok(bResumed);
  assert.deepEqual(session.state.pendingResume, ["a"]);
});

test("change リスナーが throw しても他のリスナーと Session は止まらない", async () => {
  const env = fakeEnv();
  const session = createSession({ env });
  let seen = 0;
  session.on("change", () => {
    throw new Error("listener bug");
  });
  session.on("change", () => seen++);
  const origError = console.error;
  console.error = () => {};
  try {
    await session.start();
  } finally {
    console.error = origError;
  }
  assert.ok(seen > 0);
  assert.equal(session.state.fullscreen, "ok");
});
