import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, Search, ChevronRight, Calendar, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type FathomMeeting = {
  recording_id: number;
  title: string;
  meeting_title: string | null;
  created_at: string;
  scheduled_start_time: string | null;
  share_url: string;
  calendar_invitees: { name: string; email: string; is_external: boolean }[];
  recorded_by: { name: string; email: string } | null;
  summary_preview: string | null;
};

interface ImportFathomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ImportFathomDialog = ({ open, onOpenChange }: ImportFathomDialogProps) => {
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["fathom-meetings", cursor],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fathom-meetings", {
        body: { action: "list", cursor },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { items: FathomMeeting[]; next_cursor: string | null };
    },
    enabled: open,
  });

  const importMutation = useMutation({
    mutationFn: async (meeting: FathomMeeting) => {
      setImportingId(meeting.recording_id);
      const { data, error } = await supabase.functions.invoke("fathom-meetings", {
        body: {
          action: "import",
          recording_id: meeting.recording_id,
          title: meeting.title,
          scheduled_start_time: meeting.scheduled_start_time,
          calendar_invitees: meeting.calendar_invitees,
          recorded_by: meeting.recorded_by,
          share_url: meeting.share_url,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Imported!", description: "Meeting transcript imported successfully." });
      queryClient.invalidateQueries({ queryKey: ["zoom-transcripts"] });
      queryClient.invalidateQueries({ queryKey: ["new-transcripts-count"] });
      setImportingId(null);
    },
    onError: (error: any) => {
      toast({ title: "Import Failed", description: error.message, variant: "destructive" });
      setImportingId(null);
    },
  });

  const filteredItems = data?.items?.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.title.toLowerCase().includes(q) ||
      (m.meeting_title || "").toLowerCase().includes(q) ||
      m.calendar_invitees.some((i) => i.name.toLowerCase().includes(q))
    );
  }) || [];

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "No date";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import from Fathom</DialogTitle>
          <DialogDescription>
            Browse your old Fathom meetings and import them with full transcript and summary.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search meetings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading meetings from Fathom...</span>
            </div>
          ) : !filteredItems.length ? (
            <div className="text-center py-12 text-muted-foreground">
              {search ? "No meetings match your search." : "No meetings found in Fathom."}
            </div>
          ) : (
            filteredItems.map((meeting) => {
              const externalInvitee = meeting.calendar_invitees.find((i) => i.is_external);
              return (
                <div
                  key={meeting.recording_id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="font-medium truncate">{meeting.title}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(meeting.scheduled_start_time || meeting.created_at)}
                      </span>
                      {externalInvitee && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {externalInvitee.name}
                        </span>
                      )}
                    </div>
                    {meeting.summary_preview && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {meeting.summary_preview}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-3 shrink-0"
                    disabled={importMutation.isPending && importingId === meeting.recording_id}
                    onClick={() => importMutation.mutate(meeting)}
                  >
                    {importMutation.isPending && importingId === meeting.recording_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-1" />
                        Import
                      </>
                    )}
                  </Button>
                </div>
              );
            })
          )}
        </div>

        {data?.next_cursor && (
          <div className="pt-2 border-t">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setCursor(data.next_cursor)}
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ChevronRight className="h-4 w-4 mr-2" />
              )}
              Load More
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ImportFathomDialog;
