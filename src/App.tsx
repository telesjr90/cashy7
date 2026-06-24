import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { LoginPage } from "@/pages/login";
import { SignupPage } from "@/pages/signup";
import { SetupPage } from "@/pages/setup";
import { AcceptInvitePage } from "@/pages/accept-invite";
import { DashboardPage } from "@/pages/dashboard";
import { BillsPage } from "@/pages/bills";
import { AddBillPage } from "@/pages/add-bill";
import { DebtPage } from "@/pages/debt";
import { SettingsPage } from "@/pages/settings";
import { ExpensesPage } from "@/pages/expenses";
import { CalendarPage } from "@/pages/calendar";
import { MonthlyReportPage } from "@/pages/monthly-report";
import { ModeToggle } from "@/components/mode-toggle";
import { AppNavigation } from "@/components/app-navigation";
import { MobileNavigation } from "@/components/mobile-navigation";
import { Button } from "@/components/ui/button";
import { LogOut, LayoutDashboard } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { getActiveNavItem } from "@/lib/navigation";

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user, household, signOut } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!household) {
    return <SetupPage />;
  }

  const handleSignOut = async () => {
    await signOut();
  };

  const activeNavItem = getActiveNavItem(location.pathname);

  return (
    <div className="min-h-screen bg-background">
      <header className="no-print sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between gap-2 px-4">
          <div className="flex min-w-0 flex-1 items-center gap-3 md:gap-6">
            <Link to="/" className="flex shrink-0 items-center gap-2 font-semibold">
              <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
              <span className="hidden sm:inline">Cashflow</span>
            </Link>
            {activeNavItem ? (
              <span
                className="truncate text-sm font-medium text-muted-foreground md:hidden"
                data-testid="mobile-current-route"
              >
                {activeNavItem.label}
              </span>
            ) : null}
            <AppNavigation className="hidden md:flex" />
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <ModeToggle />
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 sm:mr-2" aria-hidden="true" />
              <span className="hidden sm:inline">Sign Out</span>
              <span className="sr-only sm:hidden">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
      <MobileNavigation />
    </div>
  );
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, household, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (user && household) {
    return <Navigate to="/" replace />;
  }

  if (user && !household) {
    return <SetupPage />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicRoute>
            <SignupPage />
          </PublicRoute>
        }
      />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route
        path="/"
        element={
          <AuthenticatedLayout>
            <DashboardPage />
          </AuthenticatedLayout>
        }
      />
      <Route
        path="/bills"
        element={
          <AuthenticatedLayout>
            <BillsPage />
          </AuthenticatedLayout>
        }
      />
      <Route
        path="/bills/new"
        element={
          <AuthenticatedLayout>
            <AddBillPage />
          </AuthenticatedLayout>
        }
      />
      <Route
        path="/debt"
        element={
          <AuthenticatedLayout>
            <DebtPage />
          </AuthenticatedLayout>
        }
      />
      <Route
        path="/settings"
        element={
          <AuthenticatedLayout>
            <SettingsPage />
          </AuthenticatedLayout>
        }
      />
      <Route
        path="/expenses"
        element={
          <AuthenticatedLayout>
            <ExpensesPage />
          </AuthenticatedLayout>
        }
      />
      <Route
        path="/calendar"
        element={
          <AuthenticatedLayout>
            <CalendarPage />
          </AuthenticatedLayout>
        }
      />
      <Route
        path="/reports/monthly"
        element={
          <AuthenticatedLayout>
            <MonthlyReportPage />
          </AuthenticatedLayout>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
