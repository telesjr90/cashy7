import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import type { BillInstance, CashPaymentTransaction, Person } from "@/lib/types";
import {
  getMyBillShareAmount,
  resolveBillShareKeyForPerson,
} from "@/lib/bill-share";
import { getHouseholdPeople } from "@/lib/user-person";
import {
  getMyCashPaymentTransactions,
  paySourceFromCurrentCash,
  getCashDeductionStatus,
  hasCashDeductionForBill,
  cashDeductionStatusLabel,
  PAYMENT_UX_EXPLANATION,
} from "@/lib/payments";
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
  Pencil,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import {
  DEBT_LINKED_BILL_DELETE_MESSAGE,
  DEBT_LINKED_BILL_EDIT_MESSAGE,
  fetchDebtLinkedBillContext,
  syncBillPaidStatusWithDebt,
} from "@/lib/sync-bill-paid-status";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export function BillsPage() {
  const { user, household, membership } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bills, setBills] = useState<BillInstance[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [paymentTransactions, setPaymentTransactions] = useState<
    CashPaymentTransaction[]
  >([]);
  const [debtLinkedBillIds, setDebtLinkedBillIds] = useState<Set<string>>(
    () => new Set()
  );
  const [debtPaymentIdByBillId, setDebtPaymentIdByBillId] = useState<
    Map<string, string>
  >(() => new Map());
  const [loading, setLoading] = useState(true);
  const [payingBillId, setPayingBillId] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [billEditForm, setBillEditForm] = useState({
    amount: "",
    telesAmount: "",
    nicoleAmount: "",
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const mappedPerson = useMemo(() => {
    if (!membership?.person_id) {
      return null;
    }
    return people.find((person) => person.id === membership.person_id) ?? null;
  }, [membership?.person_id, people]);

  const shareKey = useMemo(
    () => resolveBillShareKeyForPerson(mappedPerson),
    [mappedPerson]
  );

  const paymentByBillId = useMemo(() => {
    const map = new Map<string, CashPaymentTransaction>();
    for (const tx of paymentTransactions) {
      if (tx.source_type === "bill_instance") {
        map.set(tx.source_id, tx);
      }
    }
    return map;
  }, [paymentTransactions]);

  const paymentByDebtPaymentId = useMemo(() => {
    const map = new Map<string, CashPaymentTransaction>();
    for (const tx of paymentTransactions) {
      if (tx.source_type === "debt_payment") {
        map.set(tx.source_id, tx);
      }
    }
    return map;
  }, [paymentTransactions]);

  const billHasCashDeduction = useCallback(
    (billId: string) =>
      hasCashDeductionForBill(billId, {
        billPaymentSourceIds: paymentByBillId,
        debtPaymentIdByBillId,
        debtPaymentTransactionSourceIds: paymentByDebtPaymentId,
      }),
    [paymentByBillId, debtPaymentIdByBillId, paymentByDebtPaymentId]
  );

  const fetchBills = useCallback(async () => {
    if (!household || !user) return;

    setLoading(true);
    setPayError(null);

    const [billsRes, peopleRes, paymentsRes] = await Promise.all([
      supabase
        .from("bill_instances")
        .select("*")
        .eq("household_id", household.id)
        .eq("year", year)
        .eq("month", month)
        .order("period_bucket")
        .order("name"),
      getHouseholdPeople(household.id),
      getMyCashPaymentTransactions(household.id, user.id),
    ]);

    if (!billsRes.error && billsRes.data) {
      const billRows = billsRes.data as BillInstance[];
      setBills(billRows);

      const { linkedIds, debtPaymentIdByBillId, error: linkedError } =
        await fetchDebtLinkedBillContext(billRows.map((bill) => bill.id));

      if (!linkedError) {
        setDebtLinkedBillIds(linkedIds);
        setDebtPaymentIdByBillId(debtPaymentIdByBillId);
      }
    }

    if (!peopleRes.error) {
      setPeople(peopleRes.people);
    }

    if (!paymentsRes.error) {
      setPaymentTransactions(paymentsRes.transactions);
    }

    setLoading(false);
  }, [household, user, year, month]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  const togglePaid = async (bill: BillInstance) => {
    const newPaidStatus = !bill.is_paid;
    const { error } = await syncBillPaidStatusWithDebt(
      bill.id,
      bill.is_paid,
      newPaidStatus
    );

    if (!error) {
      setBills((prev) =>
        prev.map((b) => (b.id === bill.id ? { ...b, is_paid: newPaidStatus } : b))
      );
    }
  };

  const payBill = async (bill: BillInstance) => {
    if (!household || !user) {
      return;
    }

    setPayError(null);

    const shareAmount = getMyBillShareAmount(bill, shareKey);
    if (shareAmount === null) {
      setPayError("Choose your budget profile in Settings before paying from cash.");
      return;
    }

    if (shareAmount <= 0) {
      setPayError("Your share for this bill is zero.");
      return;
    }

    if (billHasCashDeduction(bill.id)) {
      setPayError("This item has already been deducted from your current amount.");
      return;
    }

    setPayingBillId(bill.id);

    const { result, error } = await paySourceFromCurrentCash({
      householdId: household.id,
      userId: user.id,
      personId: membership?.person_id ?? null,
      sourceType: "bill_instance",
      sourceId: bill.id,
      amount: shareAmount,
      notes: `Paid bill: ${bill.name}`,
    });

    setPayingBillId(null);

    if (error || !result) {
      setPayError(error ?? "Could not pay bill from current cash.");
      return;
    }

    if (result.transaction) {
      setPaymentTransactions((prev) => [result.transaction!, ...prev]);
    }

    setBills((prev) =>
      prev.map((b) => (b.id === bill.id ? { ...b, is_paid: true } : b))
    );
  };

  const deleteBill = async (billId: string) => {
    if (isDebtLinkedBill(billId)) {
      return;
    }

    const { error } = await supabase
      .from("bill_instances")
      .delete()
      .eq("id", billId);

    if (!error) {
      setBills((prev) => prev.filter((b) => b.id !== billId));
      setDebtLinkedBillIds((prev) => {
        const next = new Set(prev);
        next.delete(billId);
        return next;
      });
    }
  };

  const isDebtLinkedBill = (billId: string) => debtLinkedBillIds.has(billId);

  const editingBill = bills.find((bill) => bill.id === editingBillId) ?? null;

  const startEditBill = (bill: BillInstance) => {
    setEditingBillId(bill.id);
    setBillEditForm({
      amount: bill.amount.toString(),
      telesAmount: bill.teles_amount.toString(),
      nicoleAmount: bill.nicole_amount.toString(),
    });
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
        {payError && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{payError}</AlertDescription>
          </Alert>
        )}

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
              {bills.length} bill{bills.length !== 1 ? "s" : ""} total.{" "}
              {PAYMENT_UX_EXPLANATION}
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
                    <TableHead className="w-12">Mark paid</TableHead>
                    <TableHead>Bill Name</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right text-blue-600 dark:text-blue-400">Teles</TableHead>
                    <TableHead className="text-right text-green-600 dark:text-green-400">Nicole</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-44">Pay & deduct cash</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.map((bill) => {
                    const debtLinked = isDebtLinkedBill(bill.id);
                    const cashStatus = getCashDeductionStatus({
                      isMarkedPaid: bill.is_paid,
                      hasPaymentTransaction: billHasCashDeduction(bill.id),
                    });

                    return (
                    <TableRow key={bill.id}>
                      <TableCell>
                        <Checkbox
                          checked={bill.is_paid}
                          onCheckedChange={() => togglePaid(bill)}
                          aria-label="Mark paid"
                        />
                      </TableCell>
                      <TableCell className={bill.is_paid ? "line-through text-muted-foreground" : ""}>
                        {bill.name}
                        {debtLinked && (
                          <p className="text-xs text-muted-foreground max-w-xs">
                            {DEBT_LINKED_BILL_EDIT_MESSAGE}{" "}
                            <Link to="/debt" className="underline underline-offset-2">
                              Debt page
                            </Link>
                          </p>
                        )}
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
                        <span className="text-xs text-muted-foreground">
                          {cashDeductionStatusLabel(cashStatus)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {cashStatus === "unpaid" ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={payingBillId === bill.id}
                            onClick={() => void payBill(bill)}
                          >
                            Pay & deduct cash
                          </Button>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {debtLinked && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => startEditBill(bill)}
                            >
                              <Pencil className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          )}
                          {debtLinked ? (
                            <p className="text-xs text-muted-foreground max-w-[12rem] text-right">
                              {DEBT_LINKED_BILL_DELETE_MESSAGE}{" "}
                              <Link to="/debt" className="underline underline-offset-2">
                                Debt page
                              </Link>
                            </p>
                          ) : (
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
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={editingBillId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingBillId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Debt-Linked Bill</DialogTitle>
            <DialogDescription>
              {editingBill
                ? `${editingBill.name} is linked to a debt payment.`
                : "This bill is linked to a debt payment."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Alert>
              <AlertDescription>
                {DEBT_LINKED_BILL_EDIT_MESSAGE}{" "}
                <Link to="/debt" className="underline underline-offset-2">
                  Go to Debt page
                </Link>
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label htmlFor="editBillAmount">Total Amount (CA$)</Label>
              <Input
                id="editBillAmount"
                type="number"
                step="0.01"
                min="0"
                value={billEditForm.amount}
                disabled
                readOnly
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editBillTelesAmount">Teles Amount (CA$)</Label>
              <Input
                id="editBillTelesAmount"
                type="number"
                step="0.01"
                min="0"
                value={billEditForm.telesAmount}
                disabled
                readOnly
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editBillNicoleAmount">Nicole Amount (CA$)</Label>
              <Input
                id="editBillNicoleAmount"
                type="number"
                step="0.01"
                min="0"
                value={billEditForm.nicoleAmount}
                disabled
                readOnly
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingBillId(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
