import type { RealtimePostgresChangesPayload, SupabaseClient } from "@supabase/supabase-js";

import type { CollectionKey, Db, EmailMessage, EmailThread, Settings } from "@/lib/data/types";

import { MAPPERS, MESSAGES_TABLE, SETTINGS_TABLE, TABLES, WRITE_ORDER, messageMapper, settingsMapper } from "./mappers";

type Row = Record<string, unknown>;
type AnyItem = { id: string };

export interface Ops {
  settings?: Settings;
  upserts: Partial<Record<CollectionKey, AnyItem[]>>;
  deletes: Partial<Record<CollectionKey, string[]>>;
  msgUpserts: { threadId: string; msg: EmailMessage }[];
  msgDeletes: string[];
}

/** Key-order-independent JSON, so records compare by value however they were built. */
function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.keys(val).sort().map((k) => [k, (val as Record<string, unknown>)[k]]))
      : val
  );
}
const same = (a: unknown, b: unknown) => stable(a) === stable(b);
const threadShell = (t: EmailThread) => ({ ...t, messages: undefined });

export function isEmpty(ops: Ops) {
  return (
    !ops.settings &&
    Object.values(ops.upserts).every((v) => !v?.length) &&
    Object.values(ops.deletes).every((v) => !v?.length) &&
    !ops.msgUpserts.length &&
    !ops.msgDeletes.length
  );
}

/** What has to be written to turn the server state `prev` into the local state `next`. */
export function diff(prev: Db, next: Db): Ops {
  const ops: Ops = { upserts: {}, deletes: {}, msgUpserts: [], msgDeletes: [] };
  if (!same(prev.settings, next.settings)) ops.settings = next.settings;

  for (const key of WRITE_ORDER) {
    const before = new Map((prev[key] as AnyItem[]).map((x) => [x.id, x]));
    const after = new Map((next[key] as AnyItem[]).map((x) => [x.id, x]));
    const compare = key === "threads" ? (x: AnyItem) => threadShell(x as EmailThread) : (x: AnyItem) => x;
    const ups = [...after.values()].filter((x) => !before.has(x.id) || !same(compare(before.get(x.id)!), compare(x)));
    const dels = [...before.keys()].filter((id) => !after.has(id));
    if (ups.length) ops.upserts[key] = ups;
    if (dels.length) ops.deletes[key] = dels;
  }

  const msgs = (db: Db) => new Map(db.threads.flatMap((t) => t.messages.map((m) => [m.id, { threadId: t.id, msg: m }] as const)));
  const mb = msgs(prev);
  const ma = msgs(next);
  for (const [id, v] of ma) if (!mb.has(id) || !same(mb.get(id), v)) ops.msgUpserts.push(v);
  // Messages of a deleted thread are removed by the database cascade.
  const deletedThreads = new Set(ops.deletes.threads ?? []);
  for (const [id, v] of mb) if (!ma.has(id) && !deletedThreads.has(v.threadId)) ops.msgDeletes.push(id);
  return ops;
}

function check(res: { error: { message: string } | null }, what: string) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
}

export async function applyOps(sb: SupabaseClient, ops: Ops) {
  if (ops.settings) check(await sb.from(SETTINGS_TABLE).upsert(settingsMapper.to(ops.settings)), "settings");
  for (const key of WRITE_ORDER) {
    const items = ops.upserts[key];
    if (items?.length) check(await sb.from(TABLES[key]).upsert(items.map((i) => MAPPERS[key].to(i))), TABLES[key]);
  }
  if (ops.msgUpserts.length)
    check(await sb.from(MESSAGES_TABLE).upsert(ops.msgUpserts.map(({ msg, threadId }) => messageMapper.to(msg, threadId))), MESSAGES_TABLE);
  if (ops.msgDeletes.length) check(await sb.from(MESSAGES_TABLE).delete().in("id", ops.msgDeletes), MESSAGES_TABLE);
  for (const key of [...WRITE_ORDER].reverse()) {
    const ids = ops.deletes[key];
    if (ids?.length) check(await sb.from(TABLES[key]).delete().in("id", ids), TABLES[key]);
  }
}

/** The server snapshot after `ops` (taken from `target`) were written successfully. */
export function applyOpsToSnapshot(snapshot: Db, ops: Ops): Db {
  let next: Db = ops.settings ? { ...snapshot, settings: ops.settings } : snapshot;
  for (const key of WRITE_ORDER) {
    const ups = ops.upserts[key];
    const dels = new Set(ops.deletes[key] ?? []);
    if (!ups?.length && !dels.size) continue;
    const list = (next[key] as AnyItem[]).filter((x) => !dels.has(x.id));
    for (const item of ups ?? []) {
      const i = list.findIndex((x) => x.id === item.id);
      const existing = i >= 0 ? list[i] : undefined;
      // Thread messages are tracked separately below.
      const value = key === "threads" ? { ...item, messages: (existing as EmailThread | undefined)?.messages ?? [] } : item;
      if (i >= 0) list[i] = value;
      else list.unshift(value);
    }
    next = { ...next, [key]: list } as Db;
  }
  if (ops.msgUpserts.length || ops.msgDeletes.length) {
    const del = new Set(ops.msgDeletes);
    next = {
      ...next,
      threads: next.threads.map((t) => {
        const incoming = ops.msgUpserts.filter((u) => u.threadId === t.id).map((u) => u.msg);
        if (!incoming.length && !t.messages.some((m) => del.has(m.id))) return t;
        const merged = t.messages.filter((m) => !del.has(m.id) && !incoming.some((x) => x.id === m.id)).concat(incoming);
        return { ...t, messages: merged.sort((a, b) => a.at.localeCompare(b.at)) };
      }),
    };
  }
  return next;
}

export async function loadAll(sb: SupabaseClient): Promise<Db> {
  const keys = Object.keys(TABLES) as CollectionKey[];
  const [settingsRes, msgRes, ...rest] = await Promise.all([
    sb.from(SETTINGS_TABLE).select("*").eq("id", 1).maybeSingle(),
    sb.from(MESSAGES_TABLE).select("*").order("at"),
    ...keys.map((k) => sb.from(TABLES[k]).select("*")),
  ]);
  check(settingsRes, SETTINGS_TABLE);
  check(msgRes, MESSAGES_TABLE);
  rest.forEach((r, i) => check(r, TABLES[keys[i]]));

  const db = {
    version: 1,
    settings: settingsMapper.from((settingsRes.data as Row) ?? {}),
  } as Db;
  keys.forEach((k, i) => {
    (db as unknown as Record<string, unknown>)[k] = ((rest[i].data as Row[]) ?? []).map((r) => MAPPERS[k].from(r));
  });
  const byThread = new Map<string, EmailMessage[]>();
  for (const r of (msgRes.data as Row[]) ?? []) {
    const { threadId, ...m } = messageMapper.from(r);
    byThread.set(threadId, [...(byThread.get(threadId) ?? []), m]);
  }
  db.threads = db.threads.map((t) => ({ ...t, messages: byThread.get(t.id) ?? [] }));
  return db;
}

export type RemoteChange =
  | { kind: "settings"; settings: Settings }
  | { kind: "upsert"; key: CollectionKey; item: AnyItem }
  | { kind: "delete"; key: CollectionKey; id: string }
  | { kind: "msg-upsert"; threadId: string; msg: EmailMessage }
  | { kind: "msg-delete"; id: string };

const tableToKey = Object.fromEntries(Object.entries(TABLES).map(([k, t]) => [t, k])) as Record<string, CollectionKey>;

export function subscribe(sb: SupabaseClient, onChange: (c: RemoteChange) => void) {
  const channel = sb.channel("wali-os-sync");
  const tables = [SETTINGS_TABLE, MESSAGES_TABLE, ...Object.values(TABLES)];
  for (const table of tables) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, (p: RealtimePostgresChangesPayload<Row>) => {
      const row = (p.eventType === "DELETE" ? p.old : p.new) as Row;
      if (table === SETTINGS_TABLE) {
        if (p.eventType !== "DELETE") onChange({ kind: "settings", settings: settingsMapper.from(row) });
      } else if (table === MESSAGES_TABLE) {
        if (p.eventType === "DELETE") onChange({ kind: "msg-delete", id: String(row.id) });
        else {
          const { threadId, ...msg } = messageMapper.from(row);
          onChange({ kind: "msg-upsert", threadId, msg });
        }
      } else {
        const key = tableToKey[table];
        if (p.eventType === "DELETE") onChange({ kind: "delete", key, id: String(row.id) });
        else onChange({ kind: "upsert", key, item: MAPPERS[key].from(row) });
      }
    });
  }
  channel.subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}

/**
 * Apply a change pushed by the server (another device, or Hermes) to both the
 * server snapshot and the local state. Local edits not yet saved win: a row is
 * only replaced locally if it still matches what the server last had.
 */
export function applyRemote(c: RemoteChange, synced: Db, local: Db): { synced: Db; local: Db } {
  const unchanged = (a: unknown, b: unknown) => same(a, b);

  if (c.kind === "settings") {
    return { synced: { ...synced, settings: c.settings }, local: unchanged(local.settings, synced.settings) ? { ...local, settings: c.settings } : local };
  }

  if (c.kind === "upsert" || c.kind === "delete") {
    const key = c.key;
    const id = c.kind === "upsert" ? c.item.id : c.id;
    const sList = synced[key] as AnyItem[];
    const lList = local[key] as AnyItem[];
    const sOld = sList.find((x) => x.id === id);
    const lCur = lList.find((x) => x.id === id);
    const withMessages = (item: AnyItem, from?: AnyItem) =>
      key === "threads" ? { ...item, messages: (from as EmailThread | undefined)?.messages ?? [] } : item;

    const put = (list: AnyItem[], item: AnyItem | null, from?: AnyItem) => {
      const rest = list.filter((x) => x.id !== id);
      if (!item) return rest;
      const value = withMessages(item, from);
      const i = list.findIndex((x) => x.id === id);
      if (i < 0) return [value, ...rest];
      const copy = [...list];
      copy[i] = value;
      return copy;
    };

    const newItem = c.kind === "upsert" ? c.item : null;
    const nextSynced = { ...synced, [key]: put(sList, newItem, sOld) } as Db;
    const noPendingEdit = sOld ? lCur !== undefined && unchanged(lCur, sOld) : lCur === undefined;
    const nextLocal = noPendingEdit ? ({ ...local, [key]: put(lList, newItem, lCur) } as Db) : local;
    return { synced: nextSynced, local: nextLocal };
  }

  // Messages
  const patch = (db: Db, threadId: string | null, msgId: string, msg: EmailMessage | null): Db => ({
    ...db,
    threads: db.threads.map((t) => {
      const has = t.messages.some((m) => m.id === msgId);
      if (!has && t.id !== threadId) return t;
      const rest = t.messages.filter((m) => m.id !== msgId);
      const messages = msg && t.id === threadId ? [...rest, msg].sort((a, b) => a.at.localeCompare(b.at)) : rest;
      return { ...t, messages };
    }),
  });
  const id = c.kind === "msg-upsert" ? c.msg.id : c.id;
  const sMsg = synced.threads.flatMap((t) => t.messages).find((m) => m.id === id);
  const lMsg = local.threads.flatMap((t) => t.messages).find((m) => m.id === id);
  const noPendingEdit = sMsg ? lMsg !== undefined && unchanged(lMsg, sMsg) : lMsg === undefined;
  const threadId = c.kind === "msg-upsert" ? c.threadId : null;
  const msg = c.kind === "msg-upsert" ? c.msg : null;
  return {
    synced: patch(synced, threadId, id, msg),
    local: noPendingEdit ? patch(local, threadId, id, msg) : local,
  };
}
