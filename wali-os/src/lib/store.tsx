"use client";

import * as React from "react";

import type { CollectionKey, Db, ItemOf, Settings } from "@/lib/data/types";
import { cloudEnabled, getSupabase } from "@/lib/supabase";
import { applyOps, applyOpsToSnapshot, applyRemote, diff, isEmpty, loadAll, subscribe } from "@/lib/sync/engine";

const STORAGE_KEY = "wali-os:data:v1";

export function emptyDb(): Db {
  return {
    version: 1,
    settings: { businessName: "", ownerName: "", ownerEmail: "", currency: "USD", clocks: [] },
    clients: [],
    services: [],
    threads: [],
    campaigns: [],
    tasks: [],
    approvals: [],
    agents: [],
    team: [],
  };
}

/** Accepts anything previously saved or imported and fills in missing fields. */
export function normalizeDb(raw: unknown): Db {
  const base = emptyDb();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<Db>;
  const arr = <T,>(v: unknown, fallback: T[]) => (Array.isArray(v) ? (v as T[]) : fallback);
  return {
    version: 1,
    settings: { ...base.settings, ...(r.settings ?? {}) },
    clients: arr(r.clients, base.clients),
    services: arr(r.services, base.services),
    threads: arr(r.threads, base.threads),
    campaigns: arr(r.campaigns, base.campaigns),
    tasks: arr(r.tasks, base.tasks),
    approvals: arr(r.approvals, base.approvals),
    agents: arr(r.agents, base.agents),
    team: arr(r.team, base.team),
  };
}

/** UUID v4, so ids are valid primary keys in the database. */
export function newId() {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const nowIso = () => new Date().toISOString();

export type StoreMode = "local" | "cloud";
export type AuthStatus = "loading" | "signed-out" | "signed-in";
export type SyncStatus = "synced" | "saving" | "error";

interface StoreValue {
  db: Db;
  ready: boolean;
  mode: StoreMode;
  auth: { status: AuthStatus; email?: string };
  sync: { status: SyncStatus; error?: string };
  add: <K extends CollectionKey>(key: K, item: ItemOf<K>) => void;
  update: <K extends CollectionKey>(key: K, id: string, patch: Partial<ItemOf<K>>) => void;
  remove: (key: CollectionKey, id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  /** Apply several changes atomically, e.g. an approval plus its email thread. */
  transact: (fn: (db: Db) => Db) => void;
  replaceAll: (db: Db) => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const StoreContext = React.createContext<StoreValue | null>(null);

export function readLocal(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeDb(JSON.parse(raw)) : emptyDb();
  } catch {
    return emptyDb();
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const mode: StoreMode = cloudEnabled ? "cloud" : "local";
  const [db, setDb] = React.useState<Db>(emptyDb);
  const [ready, setReady] = React.useState(false);
  const [auth, setAuth] = React.useState<StoreValue["auth"]>({ status: mode === "cloud" ? "loading" : "signed-in" });
  const [sync, setSync] = React.useState<StoreValue["sync"]>({ status: "synced" });

  const dbRef = React.useRef(db);
  React.useEffect(() => {
    dbRef.current = db;
  }, [db]);
  /** Cloud mode: what the server is known to hold. */
  const syncedRef = React.useRef<Db | null>(null);
  const skipNextLocalWrite = React.useRef(false);

  // ── Local mode: browser storage ──────────────────────────────────────────
  React.useEffect(() => {
    if (mode !== "local") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after mount
    setDb(readLocal());
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      skipNextLocalWrite.current = true;
      setDb(readLocal());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [mode]);

  React.useEffect(() => {
    if (mode !== "local" || !ready) return;
    if (skipNextLocalWrite.current) {
      skipNextLocalWrite.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      // Storage full or blocked; the in-memory state still works for this session.
    }
  }, [db, ready, mode]);

  // ── Cloud mode: Supabase auth, load, realtime ────────────────────────────
  React.useEffect(() => {
    const sb = getSupabase();
    if (mode !== "cloud" || !sb) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    const start = async (email?: string) => {
      try {
        const loaded = await loadAll(sb);
        if (cancelled) return;
        syncedRef.current = loaded;
        setDb(loaded);
        setReady(true);
        setAuth({ status: "signed-in", email });
        setSync({ status: "synced" });
        unsubscribe?.();
        unsubscribe = subscribe(sb, (change) => {
          const prevSynced = syncedRef.current;
          if (!prevSynced) return;
          syncedRef.current = applyRemote(change, prevSynced, prevSynced).synced;
          setDb((cur) => applyRemote(change, prevSynced, cur).local);
        });
      } catch (e) {
        setAuth({ status: "signed-in", email });
        setSync({ status: "error", error: e instanceof Error ? e.message : String(e) });
        setReady(true);
      }
    };

    const stop = () => {
      unsubscribe?.();
      unsubscribe = undefined;
      syncedRef.current = null;
      setDb(emptyDb());
      setReady(false);
      setAuth({ status: "signed-out" });
    };

    sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) start(data.session.user.email ?? undefined);
      else stop();
    });
    const { data: listener } = sb.auth.onAuthStateChange((event, session) => {
      // Defer: Supabase recommends not awaiting other calls inside this callback.
      setTimeout(() => {
        if (cancelled) return;
        if (event === "SIGNED_IN" && session && !syncedRef.current) start(session.user.email ?? undefined);
        if (event === "SIGNED_OUT") stop();
      }, 0);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      listener.subscription.unsubscribe();
    };
  }, [mode]);

  // ── Cloud mode: write local changes to Supabase ──────────────────────────
  const flushing = React.useRef(false);
  const again = React.useRef(false);
  const retryTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flushRef = React.useRef<() => Promise<void>>(async () => {});

  const flush = React.useCallback(async () => {
    const sb = getSupabase();
    if (!sb || !syncedRef.current) return;
    if (flushing.current) {
      again.current = true;
      return;
    }
    flushing.current = true;
    clearTimeout(retryTimer.current);
    try {
      do {
        again.current = false;
        const ops = diff(syncedRef.current!, dbRef.current);
        if (isEmpty(ops)) break;
        setSync({ status: "saving" });
        await applyOps(sb, ops);
        syncedRef.current = applyOpsToSnapshot(syncedRef.current!, ops);
      } while (again.current);
      setSync({ status: "synced" });
    } catch (e) {
      setSync({ status: "error", error: e instanceof Error ? e.message : String(e) });
      retryTimer.current = setTimeout(() => void flushRef.current(), 8000);
    } finally {
      flushing.current = false;
    }
  }, []);

  React.useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  React.useEffect(() => {
    if (mode !== "cloud" || !ready || !syncedRef.current) return;
    const t = setTimeout(() => void flush(), 400);
    return () => clearTimeout(t);
  }, [db, ready, mode, flush]);

  // Don't lose unsaved edits when the tab is closed mid-save.
  React.useEffect(() => {
    if (mode !== "cloud") return;
    const onUnload = (e: BeforeUnloadEvent) => {
      if (syncedRef.current && !isEmpty(diff(syncedRef.current, dbRef.current))) e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [mode]);

  const value = React.useMemo<StoreValue>(
    () => ({
      db,
      ready,
      mode,
      auth,
      sync,
      add: (key, item) => setDb((d) => ({ ...d, [key]: [item, ...d[key]] }) as Db),
      update: (key, id, patch) =>
        setDb((d) => ({ ...d, [key]: (d[key] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...patch } : x)) }) as Db),
      remove: (key, id) => setDb((d) => ({ ...d, [key]: (d[key] as { id: string }[]).filter((x) => x.id !== id) }) as Db),
      updateSettings: (patch) => setDb((d) => ({ ...d, settings: { ...d.settings, ...patch } })),
      transact: (fn) => setDb((d) => fn(d)),
      replaceAll: (next) => setDb(normalizeDb(next)),
      signIn: async (email, password) => {
        const sb = getSupabase();
        if (!sb) return "Cloud sync is not configured.";
        const { error } = await sb.auth.signInWithPassword({ email, password });
        return error ? error.message : null;
      },
      signOut: async () => {
        await getSupabase()?.auth.signOut();
      },
    }),
    [db, ready, mode, auth, sync]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = React.useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

/** Everyone who can own work or request an approval: you, your team, your agents. */
export function usePeople() {
  const { db } = useStore();
  return React.useMemo(() => {
    const owner = db.settings.ownerName.trim() || "Me";
    return {
      owner,
      team: [owner, ...db.team.map((m) => m.name).filter((n) => n && n !== owner)],
      requesters: [owner, ...db.team.map((m) => m.name), ...db.agents.map((a) => a.name)].filter(
        (n, i, all) => n && all.indexOf(n) === i
      ),
    };
  }, [db.settings.ownerName, db.team, db.agents]);
}
