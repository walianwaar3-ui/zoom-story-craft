"use client";

import * as React from "react";

import type { CollectionKey, Db, ItemOf, Settings } from "@/lib/data/types";

const STORAGE_KEY = "wali-os:data:v1";

export function emptyDb(): Db {
  return {
    version: 1,
    settings: { businessName: "", ownerName: "", ownerEmail: "", currency: "USD", clocks: [] },
    clients: [],
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
    threads: arr(r.threads, base.threads),
    campaigns: arr(r.campaigns, base.campaigns),
    tasks: arr(r.tasks, base.tasks),
    approvals: arr(r.approvals, base.approvals),
    agents: arr(r.agents, base.agents),
    team: arr(r.team, base.team),
  };
}

export function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const nowIso = () => new Date().toISOString();

interface StoreValue {
  db: Db;
  ready: boolean;
  add: <K extends CollectionKey>(key: K, item: ItemOf<K>) => void;
  update: <K extends CollectionKey>(key: K, id: string, patch: Partial<ItemOf<K>>) => void;
  remove: (key: CollectionKey, id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  /** Apply several changes atomically, e.g. an approval plus its email thread. */
  transact: (fn: (db: Db) => Db) => void;
  replaceAll: (db: Db) => void;
}

const StoreContext = React.createContext<StoreValue | null>(null);

function read(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeDb(JSON.parse(raw)) : emptyDb();
  } catch {
    return emptyDb();
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = React.useState<Db>(emptyDb);
  const [ready, setReady] = React.useState(false);
  const skipNextWrite = React.useRef(false);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after mount
    setDb(read());
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      skipNextWrite.current = true;
      setDb(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      // Storage full or blocked; the in-memory state still works for this session.
    }
  }, [db, ready]);

  const value = React.useMemo<StoreValue>(
    () => ({
      db,
      ready,
      add: (key, item) => setDb((d) => ({ ...d, [key]: [item, ...d[key]] }) as Db),
      update: (key, id, patch) =>
        setDb((d) => ({ ...d, [key]: (d[key] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...patch } : x)) }) as Db),
      remove: (key, id) => setDb((d) => ({ ...d, [key]: (d[key] as { id: string }[]).filter((x) => x.id !== id) }) as Db),
      updateSettings: (patch) => setDb((d) => ({ ...d, settings: { ...d.settings, ...patch } })),
      transact: (fn) => setDb((d) => fn(d)),
      replaceAll: (next) => setDb(normalizeDb(next)),
    }),
    [db, ready]
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
