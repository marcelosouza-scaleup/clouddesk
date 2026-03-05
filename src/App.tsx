import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useTheme } from "@/lib/theme";
import Inbox from "./pages/Inbox";
import Contacts from "./pages/Contacts";
import Knowledge from "./pages/Knowledge";
import MacrosPage from "./pages/Macros";
import SettingsPage from "./pages/Settings";
import NotFound from "./pages/NotFound";
import WidgetPreview from "./pages/WidgetPreview";
import { DashboardLayout } from "./components/dashboard/DashboardLayout";

const queryClient = new QueryClient();

// DEV MODE: AuthGate bypassed — mock user active via authStore
function AuthGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

const App = () => {
  useTheme(); // Initialize theme

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/widget-preview" element={<WidgetPreview />} />
            <Route path="*" element={
              <AuthGate>
                <Routes>
                  <Route path="/" element={<Navigate to="/inbox" replace />} />
                  <Route element={<DashboardLayout />}>
                    <Route path="/inbox" element={<Inbox />} />
                    <Route path="/contacts" element={<Contacts />} />
                    <Route path="/knowledge" element={<Knowledge />} />
                    <Route path="/macros" element={<MacrosPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AuthGate>
            } />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
