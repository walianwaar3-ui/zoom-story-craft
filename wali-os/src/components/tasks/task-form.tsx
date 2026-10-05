"use client";

import * as React from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Priority, Task, TaskStatus } from "@/lib/data/types";
import { todayIso } from "@/lib/format";
import { newId, nowIso, usePeople, useStore } from "@/lib/store";

const NONE = "__none";

export const taskColumns: { id: TaskStatus; title: string }[] = [
  { id: "todo", title: "To do" },
  { id: "in-progress", title: "In progress" },
  { id: "review", title: "In review" },
  { id: "done", title: "Done" },
];

export function TaskFormDialog({ open, onOpenChange, task }: { open: boolean; onOpenChange: (open: boolean) => void; task?: Task }) {
  const { db, add, update } = useStore();
  const { owner, team } = usePeople();
  const init = React.useCallback(
    () => ({
      title: task?.title ?? "",
      description: task?.description ?? "",
      status: task?.status ?? ("todo" as TaskStatus),
      priority: task?.priority ?? ("medium" as Priority),
      assignee: task?.assignee ?? owner,
      clientId: task?.clientId ?? NONE,
      due: task?.due ?? todayIso(1),
      tags: task?.tags.join(", ") ?? "",
    }),
    [task, owner]
  );
  const [form, setForm] = React.useState(init);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form each time the dialog opens
    if (open) setForm(init());
  }, [open, init]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    const data = {
      ...form,
      title: form.title.trim(),
      clientId: form.clientId === NONE ? undefined : form.clientId,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    };
    if (task) {
      update("tasks", task.id, data);
      toast.success("Task updated");
    } else {
      add("tasks", { ...data, id: newId(), createdAt: nowIso() });
      toast.success("Task created");
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={save} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
            <DialogDescription>Track delivery work for clients or the business.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title *" htmlFor="t-title" className="sm:col-span-2">
              <Input id="t-title" autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Description" htmlFor="t-desc" className="sm:col-span-2">
              <Textarea id="t-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-20" />
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TaskStatus })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {taskColumns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as Priority })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["urgent", "high", "medium", "low"] as const).map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Assignee">
              <Select value={form.assignee} onValueChange={(v) => setForm({ ...form, assignee: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([...team, form.assignee])].filter(Boolean).map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Due date" htmlFor="t-due">
              <Input id="t-due" type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
            </Field>
            <Field label="Client">
              <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Internal (no client)</SelectItem>
                  {db.clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tags" htmlFor="t-tags" hint="Comma separated">
              <Input id="t-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!form.title.trim()}>
              {task ? "Save changes" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
