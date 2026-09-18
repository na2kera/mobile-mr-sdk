// 端末ごとの較正値（fov / camZoom / handScale 等）の保存。
// mobile-mr では較正値を毎回 URL に書かせる運用で、統合デモが増えるほど付け忘れが起きた
// （PAIN_POINTS「較正値を URL に毎回書かせる運用は初見の人に破綻する」、issue #10）。
// 優先は URL 指定 > 保存値 > 既定。URL で指定された値は保存して次回から自動で使う。
// localStorage は private モードや容量超過で throw しうるので、失敗しても動作は変えない

import { readNumber, type NumberRange } from "./params.js";

/** localStorage 互換の最小 interface（テストでは Map を包んで渡す） */
export type ProfileStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type Profile = {
  get(name: string): number | undefined;
  set(name: string, value: number): void;
  remove(name: string): void;
  /**
   * URL 指定 > 保存値 > fallback。URL の値（範囲内のもの）は保存する。
   * `?name=reset` で保存値を消して fallback に戻す
   */
  read(params: URLSearchParams, name: string, fallback: number, range?: NumberRange): number;
};

function defaultStorage(): ProfileStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined; // 設定でブロックされていると参照だけで throw する
  }
}

export function createProfile(namespace: string, storage = defaultStorage()): Profile {
  const key = (name: string) => `${namespace}:${name}`;
  const get = (name: string): number | undefined => {
    try {
      const raw = storage?.getItem(key(name));
      if (raw === null || raw === undefined) return undefined;
      const v = Number(raw);
      return Number.isFinite(v) ? v : undefined;
    } catch {
      return undefined;
    }
  };
  const set = (name: string, value: number) => {
    try {
      storage?.setItem(key(name), String(value));
    } catch {
      /* 保存できなくても動作は変えない */
    }
  };
  const remove = (name: string) => {
    try {
      storage?.removeItem(key(name));
    } catch {
      /* 同上 */
    }
  };
  return {
    get,
    set,
    remove,
    read(params, name, fallback, range) {
      if (params.get(name) === "reset") {
        remove(name);
        return fallback;
      }
      const sentinel = Number.NaN;
      const fromUrl = readNumber(params, name, sentinel, range);
      if (!Number.isNaN(fromUrl)) {
        set(name, fromUrl);
        return fromUrl;
      }
      const saved = get(name);
      if (saved !== undefined) {
        const { min = Number.EPSILON, max = Infinity } = range ?? {};
        if (saved >= min && saved <= max) return saved;
      }
      return fallback;
    },
  };
}
