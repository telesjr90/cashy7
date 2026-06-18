import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import type { BillInstance } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  ArrowLeft,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export function BillsPage() {
  const { household } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bills, setBills] = useState<BillInstance[]>([]);
  const [loading, setLoading] = useState(true);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const fetchBills = useCallback(async () => {
    if (!household) return;

    setLoading(true);
    const { data, error } = await supabase
      .from("bill_instances")
      .select("*")
      .eq("household_id", household.id)
      .eq("year", year)
      .eq("month", month)
      .order("period_bucket")
      .order("name");

    if (!error && data) {
      setBills(data as BillInstance[]);
    }
    setLoading(false);
  }, [household, year, month]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  const togglePaid = async (bill: BillInstance) => {
    const { error } = await supabase
      .from("bill_instances")
      .update({ is_paid: !bill.is_paid })
      .eq("id", bill.id);

    if (!error) {
      setBills((prev) =>
        prev.map((b) => (b.id === bill.id ? { ...b, is_paid: !b.is_paid } : b))
      );
    }
  };

  const deleteBill = async (billId: string) => {
    const { error } = await supabase
      .from("bill_instances")
      .delete()
      .eq("id", billId);

    if (!error) {
      setBills((prev) => prev.filter((b) => b.id !== billId));
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const navigateMonth = (direction: "prev" | "next") => {
    setCurrentDate((prev) => {
      const newDate = new Date(prev);
      if (direction === "prev") {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      return newDate;
    });
  };

  const goToCurrentMonth = () => {
    setCurrentDate(new Date());
  };

  const period1Bills = bills.filter((b) => b.period_bucket === "1_14");
  const period2Bills = bills.filter((b) => b.period_bucket === "15_eom");

  const period1Total = period1Bills.reduce((sum, b) => sum + Number(b.amount), 0);
  const period2Total = period2Bills.reduce((sum, b) => sum + Number(b.amount), 0);
  const telesTotal = bills.reduce((sum, b) => sum + Number(b.teles_amount), 0);
  const nicoleTotal = bills.reduce((sum, b) => sum + Number(b.nicole_amount), 0);

  if (!household) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">All Bills</h1>
                <p className="text-sm text-muted-foreground">
                  {MONTHS[month - 1]} {year}
                </p>
              </div>
            </div>
            <Link to="/bills/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Bill
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigateMonth("prev")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-4">
              <Select
                value={month.toString()}
                onValueChange={(value) => {
                  const newDate = new Date(currentDate);
                  newDate.setMonth(parseInt(value) - 1);
                  setCurrentDate(newDate);
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={(i + 1).toString()}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={year.toString()}
                onValueChange={(value) => {
                  const newDate = new Date(currentDate);
                  newDate.setFullYear(parseInt(value));
                  setCurrentDate(newDate);
                }}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => year - 2 + i).map((y) => (
                    <SelectItem key={y} value={y.toString()}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="icon" onClick={() => navigateMonth("next")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="ghost" onClick={goToCurrentMonth}>
            Today
          </Button>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>1st - 14th Total</CardDescription>
              <CardTitle className="text-2xl">{formatCurrency(period1Total)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>15th - EOM Total</CardDescription>
              <CardTitle className="text-2xl">{formatCurrency(period2Total)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Teles Total</CardDescription>
              <CardTitle className="text-2xl text-blue-600 dark:text-blue-400">
                {formatCurrency(telesTotal)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Nicole Total</CardDescription>
              <CardTitle className="text-2xl text-green-600 dark:text-green-400">
                {formatCurrency(nicoleTotal)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Bills for {MONTHS[month - 1]} {year}</CardTitle>
            <CardDescription>
              {bills.length} bill{bills.length !== 1 ? "s" : ""} total
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : bills.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-muted-foreground">No bills for this month</p>
                <Link to="/bills/new">
                  <Button variant="link" className="mt-2">
                    Add your first bill
                  </Button>
                </Link>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Paid</TableHead>
                    <TableHead>Bill Name</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right text-blue-600 dark:text-blue-400">Teles</TableHead>
                    <TableHead className="text-right text-green-600 dark:text-green-400">Nicole</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.map((bill) => (
                    <TableRow key={bill.id}>
                      <TableCell>
                        <Checkbox
                          checked={bill.is_paid}
                          onCheckedChange={() => togglePaid(bill)}
                        />
                      </TableCell>
                      <TableCell className={bill.is_paid ? "line-through text-muted-foreground" : ""}>
                        {bill.name}
                        {bill.notes && (
                          <p className="text-xs text-muted-foreground truncate max-w-xs">
                            {bill.notes}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {bill.period_bucket === "1_14" ? "1st-14th" : "15th-EOM"}
                      </TableCell>
                      <TableCell>
                        {bill.due_date ? format(new Date(bill.due_date), "MMM d") : "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(Number(bill.amount))}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(Number(bill.teles_amount))}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(Number(bill.nicole_amount))}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Bill</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{bill.name}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteBill(bill.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
