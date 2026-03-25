import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import TasksPage from "./pages/TasksPage";
import EventsPage from "./pages/EventsPage";
import EventDetailPage from "./pages/EventDetailPage";
import CalendarPage from "./pages/CalendarPage";
import ChatPage from "./pages/ChatPage";
import TeamPage from "./pages/TeamPage";
import ReportsPage from "./pages/ReportsPage";
import ProcessesPage from "./pages/ProcessesPage";
import ProcessDetailPage from "./pages/ProcessDetailPage";
import AppLayout from "./components/layout/AppLayout";
import AiFloatingChat from "./components/AiFloatingChat";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30000,
      refetchOnWindowFocus: false,
    },
  },
});

function LoadingSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, role, loading } = useAuth();
  
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(role)) return <Navigate to="/dashboard" replace />;
  
  return <AppLayout>{children}</AppLayout>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) return <LoadingSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppContent() {
  const { user } = useAuth();
  
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/tasks" element={<ProtectedRoute><TasksPage /></ProtectedRoute>} />
        <Route path="/events" element={<ProtectedRoute><EventsPage /></ProtectedRoute>} />
        <Route path="/events/:id" element={<ProtectedRoute><EventDetailPage /></ProtectedRoute>} />
        <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/processes" element={<ProtectedRoute><ProcessesPage /></ProtectedRoute>} />
        <Route path="/processes/:id" element={<ProtectedRoute><ProcessDetailPage /></ProtectedRoute>} />
        <Route path="/team" element={<ProtectedRoute roles={['admin', 'gestor']}><TeamPage /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute roles={['admin', 'gestor']}><ReportsPage /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {user && <AiFloatingChat />}
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
            <AppContent />
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
