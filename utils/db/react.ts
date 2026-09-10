/**
 * db/react.ts — 替换 @instantdb/react，对外暴露相同的 React Hooks API。
 *
 * 实现的 hooks：
 *   db.useAuth()             →  { user: { email, id } | null }
 *   db.useConnectionStatus() →  "open" | "closed"
 *   db.useQuery(query)       →  { data: { [collection]: items[] } }
 *
 * 以及透传给 core 的方法：
 *   db.queryOnce / db.transact / db.getAuth / db.tx / db._reactor
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { getActiveProvider } from "~utils/sync/provider";

import coreDb, { type DbData } from "./core";

// ─── 连接状态 ─────────────────────────────────────────────
type ConnectionStatus = "open" | "closed";

const useConnectionStatus = (): ConnectionStatus => {
  const [status, setStatus] = useState<ConnectionStatus>("closed");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const provider = await getActiveProvider();
      const available = provider ? await provider.isAvailable() : false;
      if (!cancelled) setStatus(available ? "open" : "closed");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
};

// ─── 认证状态 ─────────────────────────────────────────────
interface AuthUser {
  email: string;
  id: string;
}

const useAuth = (): { user: AuthUser | null; isLoading: boolean } => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    coreDb.getAuth().then((u) => {
      if (!cancelled) {
        setUser(u);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { user, isLoading };
};

// ─── useQuery ─────────────────────────────────────────────
type QueryResult<Q extends Record<string, unknown> | null> = {
  data: Q extends null ? null : DbData;
  isLoading: boolean;
  error: Error | null;
};

function useQuery<Q extends Record<string, unknown> | null>(query: Q): QueryResult<Q> {
  const [result, setResult] = useState<QueryResult<Q>>({
    data: null as any,
    isLoading: query !== null,
    error: null,
  });

  // 序列化 query，避免对象引用变化触发无限循环
  const queryKey = query === null ? null : JSON.stringify(query);
  const prevKeyRef = useRef<string | null>(undefined as any);

  const run = useCallback(async (q: Record<string, unknown>) => {
    setResult((prev) => ({ ...prev, isLoading: true }));
    try {
      const res = await coreDb.queryOnce(q);
      setResult({ data: res.data as any, isLoading: false, error: null });
    } catch (e) {
      setResult({ data: null as any, isLoading: false, error: e as Error });
    }
  }, []);

  useEffect(() => {
    if (queryKey === prevKeyRef.current) return;
    prevKeyRef.current = queryKey;

    if (query === null) {
      setResult({ data: null as any, isLoading: false, error: null });
      return;
    }

    run(query as Record<string, unknown>);
  });

  return result;
}

// ─── Public db 对象 ──────────────────────────────────────
const db = {
  // React hooks
  useAuth,
  useConnectionStatus,
  useQuery,

  // 兼容 InstantDB 的 auth 对象（signOut 在无账号模式下为 no-op）
  auth: {
    signOut: async () => {
      // 无账号体系，signOut 相当于把 syncProvider 设为 none
      const { setSyncSettings } = await import("~storage/syncSettings");
      await setSyncSettings({ provider: "none" });
      coreDb.invalidateCache();
    },
  },

  // 透传给 core（background / storage.ts 使用）
  queryOnce: coreDb.queryOnce.bind(coreDb),
  transact: coreDb.transact.bind(coreDb),
  getAuth: coreDb.getAuth.bind(coreDb),
  tx: coreDb.tx,
  _reactor: coreDb._reactor,
  sync: coreDb.sync.bind(coreDb),
  invalidateCache: coreDb.invalidateCache.bind(coreDb),
};

export default db;
