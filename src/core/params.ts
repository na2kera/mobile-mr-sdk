// URL クエリの読み取り。mobile-mr では numParam の署名が 02（min/max なし）と 03〜05（min/max 付き）で
// 分かれ、統合デモでは同じ名前が別の意味に化けた（PAIN_POINTS「numParam の署名が 2 種類に分岐した」
// 「デモを統合すると URL パラメータの名前が衝突する」）。ここでは署名を 1 種類にし、
// SDK の各モジュールが読む名前を登録して衝突を検出できるようにする。
// `URLSearchParams` は引数で受け取る（import 時に location を読まない = Node でテストできる）

export type NumberRange = { min?: number; max?: number };

/**
 * `?name=数値` を読む。未指定・数値でない・範囲外なら fallback。
 * min の既定が EPSILON なのは「0 や負数を弾く」ため（0 を許すパラメータは min: 0 を明示する）
 */
export function readNumber(
  params: URLSearchParams,
  name: string,
  fallback: number,
  { min = Number.EPSILON, max = Infinity }: NumberRange = {},
): number {
  const v = Number(params.get(name) ?? NaN);
  return Number.isFinite(v) && v >= min && v <= max ? v : fallback;
}

/** `?name=WxH` 形式の解像度指定を読む（mobile-mr の camRes と同じ形式） */
export function readResolution(
  params: URLSearchParams,
  name: string,
  fallback: [number, number],
): [number, number] {
  const parsed = (params.get(name) ?? "").split(/x/i).map(Number);
  return parsed.length === 2 && parsed.every((v) => Number.isFinite(v) && v > 0)
    ? [parsed[0], parsed[1]]
    : fallback;
}

/**
 * 真偽のパラメータ。未指定なら fallback。`?name` / `?name=1` は true、`?name=0` / `false` / `off` は false
 * （mobile-mr の `?autostart` と `?gravityAlign=0` の両方の書き方を受ける）
 */
export function readFlag(params: URLSearchParams, name: string, fallback = false): boolean {
  if (!params.has(name)) return fallback;
  const v = (params.get(name) ?? "").trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "off" || v === "no");
}

export type ParamRegistry = {
  /** owner（モジュール名や demo 名）が読む名前を登録する。別の owner が同じ名前を登録済みなら throw */
  declare(owner: string, names: readonly string[]): void;
  /** name を読む owner。未登録なら undefined */
  ownerOf(name: string): string | undefined;
  /** 登録済みの全パラメータ名（案内文の生成やテストに使う） */
  names(): string[];
};

export function createParamRegistry(): ParamRegistry {
  const owners = new Map<string, string>();
  return {
    declare(owner, names) {
      for (const name of names) {
        const existing = owners.get(name);
        if (existing !== undefined && existing !== owner) {
          throw new Error(
            `URL パラメータ "${name}" は "${existing}" と "${owner}" の両方が読もうとしている。名前を変えること`,
          );
        }
        owners.set(name, owner);
      }
    },
    ownerOf: (name) => owners.get(name),
    names: () => [...owners.keys()],
  };
}
