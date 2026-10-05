"use client";

import * as React from "react";
import { Circle, CircleCheck, CircleDashed, CircleDot, LayoutGrid, List, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { PriorityLabel } from "@/components/shared/status";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getClient, tasks as seed, type Priority, type Task, type TaskStatus } from "@/lib/data";
import { dueLabel, formatDate } from "@/lib/format";
import { cn, initials } from "@/lib/utils";

const columns: { id: TaskStatus; title: string; icon: React.ComponentType<{ className?: string }>; tone: string }[] = [
  { id: "todo", title: "To do", icon: Circle, tone: "text-muted-foreground" },
  { id: "in-progress", title: "In progress", icon: CircleDashed, tone: "text-primary" },
  { id: "review", title: "In review", icon: CircleDot, tone: "text-warning" },
  { id: "done", title: "Done", icon: CircleCheck, tone: "text-success" },
];

const assignees = ["Wali", "Ayesha", "Hamza", "Sofia"];

function DueChip({ due, done = false }: { due: string; done?: boolean }) {
  if (done) return <span className="text-xs text-muted-foreground">{formatDate(due)}</span>;
  const d = dueLabel(due);
  return (
    <span
      className={cn(
        "text-xs",
        d.tone === "overdue" && "font-medium text-destructive",
        d.tone === "today" && "font-medium text-warning",
        (d.tone === "soon" || d.tone === "later") && "text-muted-foreground"
      )}
    >
      {d.label}
    </span>
  );
}

function TaskMenu({ task, onMove }: { task: Task; onMove: (id: string, s: TaskStatus) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="size-6" aria-label="Task actions" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Move to</DropdownMenuLabel>
        {columns
          .filter((c) => c.id !== task.status)
          .map((c) => (
            <DropdownMenuItem key={c.id} onClick={() => onMove(task.id, c.id)}>
              <c.icon className={c.tone} /> {c.title}
            </DropdownMenuItem>
          ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => toast("Reminder sent to " + task.assignee)}>Nudge assignee</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TaskCard({ task, onMove }: { task: Task; onMove: (id: string, s: TaskStatus) => void }) {
  const client = getClient(task.clientId);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="group cursor-grab rounded-lg border bg-card p-3 shadow-xs transition-shadow hover:shadow-md active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        <p className={cn("flex-1 text-sm leading-snug font-medium", task.status === "done" && "text-muted-foreground line-through")}>
          {task.title}
        </p>
        <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <TaskMenu task={task} onMove={onMove} />
        </div>
      </div>
      {task.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>}
      {client && <p className="mt-2 truncate text-xs text-muted-foreground">↳ {client.company}</p>}
      <div className="mt-2.5 flex flex-wrap gap-1">
        {task.tags.map((t) => (
          <Badge key={t} variant="muted" className="px-1.5 py-0 text-[10px]">
            {t}
          </Badge>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <PriorityLabel priority={task.priority} />
        <div className="flex items-center gap-2">
          <DueChip due={task.due} done={task.status === "done"} />
          <Avatar className="size-6" title={task.assignee}>
            <AvatarFallback className="text-[10px]">{initials(task.assignee)}</AvatarFallback>
          </Avatar>
        </div>
      </div>
    </div>
  );
}

export function TasksView() {
  const [items, setItems] = React.useState<Task[]>(seed);
  const [view, setView] = React.useState<"board" | "list">("board");
  const [assignee, setAssignee] = React.useState("all");
  const [dragOver, setDragOver] = React.useState<TaskStatus | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState<{ title: string; assignee: string; priority: Priority; due: string }>({
    title: "",
    assignee: "Wali",
    priority: "medium",
    due: "2026-10-07",
  });

  const visible = items.filter((t) => assignee === "all" || t.assignee === assignee);

  const move = (id: string, status: TaskStatus) => {
    setItems((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t)));
    const col = columns.find((c) => c.id === status)!;
    toast.success(`Moved to ${col.title}`);
  };

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setItems((ts) => [
      { id: `tk_${ts.length + 100}`, title: form.title.trim(), status: "todo", priority: form.priority, assignee: form.assignee, due: form.due, tags: [] },
      ...ts,
    ]);
    setDialogOpen(false);
    setForm((f) => ({ ...f, title: "" }));
    toast.success("Task created");
  };

  const openCount = items.filter((t) => t.status !== "done").length;
  const overdue = items.filter((t) => t.status !== "done" && dueLabel(t.due).tone === "overdue").length;
  const dueToday = items.filter((t) => t.status !== "done" && dueLabel(t.due).tone === "today").length;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader
        title="Tasks"
        description={`${openCount} open · ${dueToday} due today${overdue ? ` · ${overdue} overdue` : ""}`}
        actions={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus /> New task
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setAssignee("all")}
            className={cn("cursor-pointer rounded-full border px-3 py-1 text-xs font-medium", assignee === "all" ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
          >
            Everyone
          </button>
          {assignees.map((a) => (
            <button
              key={a}
              onClick={() => setAssignee(a)}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-full border py-0.5 pr-3 pl-0.5 text-xs font-medium",
                assignee === a ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              <Avatar className="size-5">
                <AvatarFallback className="text-[9px] text-foreground">{initials(a)}</AvatarFallback>
              </Avatar>
              {a}
            </button>
          ))}
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList>
            <TabsTrigger value="board">
              <LayoutGrid /> Board
            </TabsTrigger>
            <TabsTrigger value="list">
              <List /> List
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {view === "board" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {columns.map((col) => {
            const colTasks = visible.filter((t) => t.status === col.id);
            return (
              <div
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(col.id);
                }}
                onDragLeave={() => setDragOver((d) => (d === col.id ? null : d))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  setDragOver(null);
                  const task = items.find((t) => t.id === id);
                  if (task && task.status !== col.id) move(id, col.id);
                }}
                className={cn(
                  "flex min-h-48 flex-col rounded-xl border border-transparent bg-muted/40 p-2 transition-colors",
                  dragOver === col.id && "border-primary/50 bg-primary/5"
                )}
              >
                <div className="flex items-center gap-2 px-2 pt-1 pb-3">
                  <col.icon className={cn("size-4", col.tone)} />
                  <span className="text-sm font-medium">{col.title}</span>
                  <span className="text-xs text-muted-foreground tabular">{colTasks.length}</span>
                  {col.id === "todo" && (
                    <Button variant="ghost" size="icon-sm" className="ml-auto size-6" onClick={() => setDialogOpen(true)} aria-label="Add task">
                      <Plus />
                    </Button>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  {colTasks.map((t) => (
                    <TaskCard key={t.id} task={t} onMove={move} />
                  ))}
                  {colTasks.length === 0 && (
                    <div className="grid flex-1 place-items-center rounded-lg border border-dashed p-6 text-xs text-muted-foreground">
                      Drop tasks here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 pl-4" />
                <TableHead>Task</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Priority</TableHead>
                <TableHead className="hidden lg:table-cell">Client</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="hidden sm:table-cell">Owner</TableHead>
                <TableHead className="w-10 pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...visible]
                .sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || a.due.localeCompare(b.due))
                .map((t) => {
                  const col = columns.find((c) => c.id === t.status)!;
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="pl-4">
                        <Checkbox
                          checked={t.status === "done"}
                          onCheckedChange={(v) => move(t.id, v ? "done" : "todo")}
                          aria-label={`Mark ${t.title} done`}
                        />
                      </TableCell>
                      <TableCell className={cn("max-w-80 truncate font-medium", t.status === "done" && "text-muted-foreground line-through")}>
                        {t.title}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <col.icon className={cn("size-3.5", col.tone)} />
                          {col.title}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <PriorityLabel priority={t.priority} />
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">{getClient(t.clientId)?.company ?? "Internal"}</TableCell>
                      <TableCell>
                        <DueChip due={t.due} done={t.status === "done"} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="flex items-center gap-2">
                          <Avatar className="size-6">
                            <AvatarFallback className="text-[10px]">{initials(t.assignee)}</AvatarFallback>
                          </Avatar>
                          <span className="text-muted-foreground">{t.assignee}</span>
                        </span>
                      </TableCell>
                      <TableCell className="pr-4">
                        <TaskMenu task={t} onMove={move} />
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={create} className="grid gap-5">
            <DialogHeader>
              <DialogTitle>New task</DialogTitle>
              <DialogDescription>Add work to the team board. It lands in To do.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="task-title">Title</Label>
              <Input
                id="task-title"
                autoFocus
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Build onboarding snapshot in GoHighLevel"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label>Assignee</Label>
                <Select value={form.assignee} onValueChange={(v) => setForm({ ...form, assignee: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {assignees.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Priority</Label>
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
              </div>
              <div className="grid gap-2">
                <Label htmlFor="task-due">Due</Label>
                <Input id="task-due" type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!form.title.trim()}>
                Create task
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
