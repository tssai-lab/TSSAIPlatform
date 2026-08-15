import { useEffect, useState } from 'react';
import { fetchFilteredUserRows } from '@/services/system/user';

let cachedMap: Map<number, string> | null = null;
let inflight: Promise<Map<number, string>> | null = null;

/** 拉取 id → username 映射（进程内缓存，供管理员页展示归属用户） */
export async function loadOwnerUsernameMap(): Promise<Map<number, string>> {
  if (cachedMap) return cachedMap;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { rows } = await fetchFilteredUserRows({});
      const map = new Map<number, string>();
      for (const row of rows) {
        if (!Number.isFinite(row.id) || !row.username?.trim()) continue;
        map.set(row.id, row.username.trim());
      }
      cachedMap = map;
      return map;
    } catch {
      return cachedMap ?? new Map();
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** 展示「username（id）」；查不到用户名时仅显示 id */
export function formatOwnerUserLabel(
  ownerUserId: number | string | null | undefined,
  usernameMap?: Map<number, string>,
): string {
  if (ownerUserId == null || ownerUserId === '') return '-';
  const id = Number(ownerUserId);
  if (!Number.isFinite(id)) return String(ownerUserId);
  const name = usernameMap?.get(id)?.trim();
  return name ? `${name}（${id}）` : String(id);
}

/**
 * 搜索框可填数字 id 或用户名；用户名按精确匹配，再退化为包含匹配（唯一命中时）。
 */
export function resolveOwnerUserIdFilter(
  raw: string | undefined,
  usernameMap?: Map<number, string>,
): number | undefined {
  const text = raw?.trim();
  if (!text) return undefined;
  if (/^\d+$/.test(text)) {
    const id = Number(text);
    return Number.isFinite(id) ? id : undefined;
  }
  if (!usernameMap || usernameMap.size === 0) return undefined;
  const lower = text.toLowerCase();
  let exact: number | undefined;
  const partial: number[] = [];
  usernameMap.forEach((name, id) => {
    const n = name.toLowerCase();
    if (n === lower) exact = id;
    else if (n.includes(lower)) partial.push(id);
  });
  if (exact != null) return exact;
  if (partial.length === 1) return partial[0];
  return undefined;
}

export function useOwnerUsernameMap(): Map<number, string> {
  const [map, setMap] = useState<Map<number, string>>(
    () => cachedMap ?? new Map(),
  );
  useEffect(() => {
    let alive = true;
    void loadOwnerUsernameMap().then((next) => {
      if (alive) setMap(next);
    });
    return () => {
      alive = false;
    };
  }, []);
  return map;
}
