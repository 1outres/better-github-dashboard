import type { Accessor, Setter } from "solid-js";

/**
 * 検索候補リスト共通の上下キー移動ハンドラを作る。
 * 戻り値の handler は ArrowUp / ArrowDown / Enter のいずれかを処理したら true を返す。
 * 呼び出し側は true のときに stopImmediatePropagation などをするかどうかを判断する。
 */
export const createArrowNavHandler = <T>(
  items: () => readonly T[],
  active: Accessor<number>,
  setActive: Setter<number>,
  onSelect: (item: T) => void,
): ((e: KeyboardEvent) => boolean) => {
  return (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(items().length - 1, i + 1));
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
      return true;
    }
    if (e.key === "Enter") {
      const it = items()[active()];
      if (it) {
        e.preventDefault();
        onSelect(it);
        return true;
      }
    }
    return false;
  };
};
