"use client";

import * as React from "react";
import { Circle, CircleCheck, CircleDashed, CircleDot, LayoutGrid, List, ListTodo, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PriorityLabel } from "@/components/shared/status";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Task, TaskStatus } from "@/lib/data/types";
import { dueLabel, formatDate } from "@/lib/format";
import { usePeople, useStore } from "@/lib/store";
import { cn, initials } from "@/lib/utils";

import { TaskFormDialog, taskColumns } from "./task-form";

const columnMeta: Record<TaskStatus, { icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  todo: { icon: Circle, tone: "text-muted-foreground" },
  "in-progress": { icon: CircleDashed, tone: "text-primary" },
  review: { icon: CircleDot, tone: "text-warning" },
  done: { icon: CircleCheck, tone: "text-success" },
};

function DueChip({ due, done = false }: { due: string; done?: boolean }) {
  if (done) return <span className="text-xs text-muted-foreground">{due ? formatDate(due) : ""}</span>;
  const d = dueLabel(due);
  return (
    <span
      className={cn(
        "text-xs whitespace-nowrap",
        d.tone === "overdue" && "font-medium text-destructive",
        d.tone === "today" && "font-medium text-warning",
        (d.tone === "soon" || d.tone === "later") && "text-muted-foreground"
      )}
    >
      {d.label}
    </span>
  );
}

interface Actions {
  move: (id: string, s: TaskStatus) => void;
  edit: (t: Task) => void;
  del: (t: Task) => void;
}

function TaskMenu({ task, actions }: { task: Task; actions: Actions }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="size-6" aria-label="Task actions" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => actions.edit(task)}>Edit</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Move to</DropdownMenuLabel>
        {taskColumns
          .filter((c) => c.id !== task.status)
          .map((c) => {
            const M = columnMeta[c.id];
            return (
              <DropdownMenuItem key={c.id} onClick={() => actions.move(task.id, c.id)}>
                <M.icon className={M.tone} /> {c.title}
              </DropdownMenuItem>
            );
          })}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => actions.del(task)}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TasksView() {
  const { db, update, remove } = useStore();
  const { team } = usePeople();
  const items = db.tasks;
  const clientName = (id?: string) => db.clients.find((c) => c.id === id)?.name;

  const [view, setView] = React.useState<"board" | "list">("board");
  const [assignee, setAssignee] = React.useState("all");
  const [dragOver, setDragOver] = React.useState<TaskStatus | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Task | undefined>();
  const [deleting, setDeleting] = React.useState<Task | undefined>();

  const people = [...new Set([...team, ...items.map((t) => t.assignee)])].filter(Boolean);
  const visible = items.filter((t) => assignee === "all" || t.assignee === assignee);

  const actions: Actions = {
    move: (id, status) => {
      update("tasks", id, { status });
      toast.success(`Moved to ${taskColumns.find((c) => c.id === status)?.title}`);
    },
    edit: (t) => {
      setEditing(t);
      setFormOpen(true);
    },
    del: setDeleting,
  };

  const openNew = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  const open = items.filter((t) => t.status !== "done");
  const overdue = open.filter((t) => dueLabel(t.due).tone === "overdue").length;
  const dueToday = open.filter((t) => dueLabel(t.due).tone === "today").length;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader
        title="Tasks"
        description={items.length ? `${open.length} open · ${dueToday} due today${overdue ? ` · ${overdue} overdue` : ""}` : "Plan and track delivery work."}
        actions={
          <Button size="sm" onClick={openNew}>
            <Plus /> New task
          </Button>
        }
      />

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListTodo}
            title="No tasks yet"
            highlight
            description="Create tasks for client delivery and your own operations. Drag them across the board as work moves."
            action={
              <Button onClick={openNew}>
                <Plus /> Create your first task
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setAssignee("all")}
                className={cn("cursor-pointer rounded-full border px-3 py-1 text-xs font-medium", assignee === "all" ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
              >
                Everyone
              </button>
              {people.length > 1 &&
                people.map((a) => (
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
              {taskColumns.map((col) => {
                const M = columnMeta[col.id];
                const colTasks = visible.filter((t) => t.status === col.id).sort((a, b) => (a.due || "9").localeCompare(b.due || "9"));
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
                      if (task && task.status !== col.id) actions.move(id, col.id);
                    }}
                    className={cn("flex min-h-48 flex-col rounded-xl border border-transparent bg-muted/40 p-2 transition-colors", dragOver === col.id && "border-primary/50 bg-primary/5")}
                  >
                    <div className="flex items-center gap-2 px-2 pt-1 pb-3">
                      <M.icon className={cn("size-4", M.tone)} />
                      <span className="text-sm font-medium">{col.title}</span>
                      <span className="text-xs text-muted-foreground tabular">{colTasks.length}</span>
                      {col.id === "todo" && (
                        <Button variant="ghost" size="icon-sm" className="ml-auto size-6" onClick={openNew} aria-label="Add task">
                          <Plus />
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-2">
                      {colTasks.map((t) => (
                        <div
                          key={t.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", t.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDoubleClick={() => actions.edit(t)}
                          className="group cursor-grab rounded-lg border bg-card p-3 shadow-xs transition-shadow hover:shadow-md active:cursor-grabbing"
                        >
                          <div className="flex items-start gap-2">
                            <p className={cn("flex-1 text-sm leading-snug font-medium", t.status === "done" && "text-muted-foreground line-through")}>{t.title}</p>
                            <div className="opacity-100 transition-opacity focus-within:opacity-100 md:opacity-0 md:group-hover:opacity-100">
                              <TaskMenu task={t} actions={actions} />
                            </div>
                          </div>
                          {t.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>}
                          {clientName(t.clientId) && <p className="mt-2 truncate text-xs text-muted-foreground">↳ {clientName(t.clientId)}</p>}
                          {t.tags.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1">
                              {t.tags.map((tag) => (
                                <Badge key={tag} variant="muted" className="px-1.5 py-0 text-[10px]">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                          <div className="mt-3 flex items-center justify-between">
                            <PriorityLabel priority={t.priority} />
                            <div className="flex items-center gap-2">
                              <DueChip due={t.due} done={t.status === "done"} />
                              <Avatar className="size-6" title={t.assignee}>
                                <AvatarFallback className="text-[10px]">{initials(t.assignee)}</AvatarFallback>
                              </Avatar>
                            </div>
                          </div>
                        </div>
                      ))}
                      {colTasks.length === 0 && (
                        <div className="grid flex-1 place-items-center rounded-lg border border-dashed p-6 text-xs text-muted-foreground">Drop tasks here</div>
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
                    .sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.due || "9").localeCompare(b.due || "9"))
                    .map((t) => {
                      const M = columnMeta[t.status];
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="pl-4">
                            <Checkbox checked={t.status === "done"} onCheckedChange={(v) => actions.move(t.id, v ? "done" : "todo")} aria-label={`Mark ${t.title} done`} />
                          </TableCell>
                          <TableCell className={cn("max-w-80 truncate font-medium", t.status === "done" && "text-muted-foreground line-through")}>{t.title}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5 text-xs">
                              <M.icon className={cn("size-3.5", M.tone)} />
                              {taskColumns.find((c) => c.id === t.status)?.title}
                            </span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <PriorityLabel priority={t.priority} />
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground lg:table-cell">{clientName(t.clientId) ?? "Internal"}</TableCell>
                          <TableCell>
                            <DueChip due={t.due} done={t.status === "done"} />
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground sm:table-cell">{t.assignee}</TableCell>
                          <TableCell className="pr-4">
                            <TaskMenu task={t} actions={actions} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}

      <TaskFormDialog open={formOpen} onOpenChange={setFormOpen} task={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(undefined)}
        title="Delete this task?"
        description={deleting?.title}
        onConfirm={() => {
          if (deleting) remove("tasks", deleting.id);
          toast.success("Task deleted");
        }}
      />
    </div>
  );
}
