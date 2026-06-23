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
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import {
  LogOut,
  Home,
  FileText,
  LayoutDashboard,
  CreditCard,
  Settings,
  Receipt,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";

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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 font-semibold">
              <LayoutDashboard className="h-5 w-5" />
              <span className="hidden sm:inline">Cashflow</span>
            </Link>
            <nav className="flex items-center gap-4">
              <Link to="/">
                <Button variant={location.pathname === "/" ? "secondary" : "ghost"} size="sm">
                  <Home className="mr-2 h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
              <Link to="/bills">
                <Button variant={location.pathname === "/bills" ? "secondary" : "ghost"} size="sm">
                  <FileText className="mr-2 h-4 w-4" />
                  Bills
                </Button>
              </Link>
              <Link to="/debt">
                <Button variant={location.pathname === "/debt" ? "secondary" : "ghost"} size="sm">
                  <CreditCard className="mr-2 h-4 w-4" />
                  Debt
                </Button>
              </Link>
              <Link to="/expenses">
                <Button
                  variant={location.pathname === "/expenses" ? "secondary" : "ghost"}
                  size="sm"
                >
                  <Receipt className="mr-2 h-4 w-4" />
                  Expenses
                </Button>
              </Link>
              <Link to="/settings">
                <Button variant={location.pathname === "/settings" ? "secondary" : "ghost"} size="sm">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Button>
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <ModeToggle />
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>
      <main>{children}</main>
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
