// 最小のイベント発行。core の "change" / "sensor" / "error" に使う（依存を増やさないため自前）

export type Listener<T> = (payload: T) => void;

export type Emitter<Events extends Record<string, unknown>> = {
  /** 登録解除の関数を返す */
  on<K extends keyof Events & string>(event: K, listener: Listener<Events[K]>): () => void;
  emit<K extends keyof Events & string>(event: K, payload: Events[K]): void;
};

export function createEmitter<Events extends Record<string, unknown>>(): Emitter<Events> {
  const listeners = new Map<string, Set<Listener<never>>>();
  return {
    on(event, listener) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(listener as Listener<never>);
      return () => {
        set.delete(listener as Listener<never>);
      };
    },
    emit(event, payload) {
      const set = listeners.get(event);
      if (!set) return;
      // 通知先で例外が出ても他の通知先と core 自身を止めない（「例外 1 回でループが止まる」と同じ痛点）
      for (const listener of [...set]) {
        try {
          (listener as Listener<typeof payload>)(payload);
        } catch (e) {
          console.error(`[mobile-mr] listener for "${event}" threw`, e);
        }
      }
    },
  };
}

export function errorText(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}
