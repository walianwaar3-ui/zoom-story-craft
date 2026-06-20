import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import Index from "./pages/Index";
import ZoomPosts from "./pages/ZoomPosts";
import GeneratePost from "./pages/GeneratePost";
import GeneratedPosts from "./pages/GeneratedPosts";
import Knowledgebase from "./pages/Knowledgebase";
import Activity from "./pages/Activity";
import Settings from "./pages/Settings";
import ToolStack from "./pages/ToolStack";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/zoom-posts" element={<ZoomPosts />} />
            <Route path="/generate-post" element={<GeneratePost />} />
            <Route path="/generated" element={<GeneratedPosts />} />
            <Route path="/knowledgebase" element={<Knowledgebase />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
