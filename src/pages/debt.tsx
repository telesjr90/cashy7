import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import type { DebtAccount, DebtPayment } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Plus, Loader2, CreditCard, Trash2 } from "lucide-react";
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
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

export function DebtPage() {
  const { household } = useAuth();
  const [debtAccounts, setDebtAccounts] = useState<DebtAccount[]>([]);
  const [debtPayments, setDebtPayments] = useState<DebtPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [accountForm, setAccountForm] = useState({
    name: "",
    originalAmount: "",
    currentBalance: "",
    targetPayoffDate: "",
    notes: "",
  });

  const [paymentForm, setPaymentForm] = useState({
    debtAccountId: "",
    paymentDate: format(now, "yyyy-MM-dd"),
    month: currentMonth.toString(),
    year: currentYear.toString(),
    totalPayment: "",
    telesAmount: "",
    nicoleAmount: "",
    paidStatus: false,
  });

  const fetchData = useCallback(async () => {
    if (!household) return;

    setLoading(true);
    const [accountsRes, paymentsRes] = await Promise.all([
      supabase
        .from("debt_accounts")
        .select("*")
        .eq("household_id", household.id)
        .order("name"),
      supabase
        .from("debt_payments")
        .select("*")
        .eq("household_id", household.id)
        .order("created_at", { ascending: false }),
    ]);

    if (accountsRes.data) setDebtAccounts(accountsRes.data as DebtAccount[]);
    if (paymentsRes.data) setDebtPayments(paymentsRes.data as DebtPayment[]);
    setLoading(false);
  }, [household]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const handlePaymentAmountChange = (value: string) => {
    const amount = parseFloat(value) || 0;
    const halfAmount = (amount / 2).toFixed(2);
    setPaymentForm((prev) => ({
      ...prev,
      totalPayment: value,
      telesAmount: halfAmount,
      nicoleAmount: halfAmount,
    }));
  };

  const createDebtAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!household) {
      setError("No household found");
      return;
    }

    const originalAmount = parseFloat(accountForm.originalAmount);
    const currentBalance = parseFloat(accountForm.currentBalance);

    if (isNaN(originalAmount) || isNaN(currentBalance)) {
      setError("Please enter valid amounts");
      return;
    }

    setSubmitting(true);

    try {
      const { error: insertError } = await supabase
        .from("debt_accounts")
        .insert({
          household_id: household.id,
          name: accountForm.name,
          original_amount: originalAmount,
          current_balance: currentBalance,
          target_payoff_date: accountForm.targetPayoffDate || null,
          notes: accountForm.notes || null,
        });

      if (insertError) throw new Error(insertError.message);

      setAccountForm({
        name: "",
        originalAmount: "",
        currentBalance: "",
        targetPayoffDate: "",
        notes: "",
      });
      setShowAccountForm(false);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const createDebtPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!household) {
      setError("No household found");
      return;
    }

    const totalPayment = parseFloat(paymentForm.totalPayment);
    const telesAmount = parseFloat(paymentForm.telesAmount);
    const nicoleAmount = parseFloat(paymentForm.nicoleAmount);

    if (isNaN(totalPayment) || totalPayment <= 0) {
      setError("Please enter a valid payment amount");
      return;
    }

    if (isNaN(telesAmount) || isNaN(nicoleAmount)) {
      setError("Please enter valid amounts for Teles and Nicole");
      return;
    }

    if (Math.abs(telesAmount + nicoleAmount - totalPayment) > 0.01) {
      setError("Teles and Nicole amounts must add up to the total payment");
      return;
    }

    setSubmitting(true);

    try {
      const month = parseInt(paymentForm.month);
      const year = parseInt(paymentForm.year);

      // First create the bill_instance
      const { data: billData, error: billError } = await supabase
        .from("bill_instances")
        .insert({
          household_id: household.id,
          bill_id: null,
          year: year,
          month: month,
          period_bucket: "1_14",
          name: "Credit Card Debt",
          amount: totalPayment,
          teles_amount: telesAmount,
          nicole_amount: nicoleAmount,
          due_date: null,
          is_paid: paymentForm.paidStatus,
          notes: null,
        })
        .select("id")
        .single();

      if (billError) throw new Error(billError.message);
      if (!billData) throw new Error("Failed to create bill instance");

      // Calculate remaining balance
      const selectedAccount = debtAccounts.find(
        (a) => a.id === paymentForm.debtAccountId
      );
      const remainingBalance = selectedAccount
        ? Math.max(0, selectedAccount.current_balance - totalPayment)
        : null;

      // Then create the debt_payment with linked_bill_instance_id
      const { error: paymentError } = await supabase
        .from("debt_payments")
        .insert({
          household_id: household.id,
          debt_account_id: paymentForm.debtAccountId,
          payment_date: paymentForm.paymentDate,
          month: month,
          year: year,
          period_bucket: "1_14",
          total_payment: totalPayment,
          teles_amount: telesAmount,
          nicole_amount: nicoleAmount,
          remaining_balance_after_payment: remainingBalance,
          paid_status: paymentForm.paidStatus,
          linked_bill_instance_id: billData.id,
        });

      if (paymentError) throw new Error(paymentError.message);

      // Update the debt account balance if we calculated it
      if (selectedAccount && remainingBalance !== null) {
        await supabase
          .from("debt_accounts")
          .update({ current_balance: remainingBalance })
          .eq("id", selectedAccount.id);
      }

      setPaymentForm({
        debtAccountId: "",
        paymentDate: format(new Date(), "yyyy-MM-dd"),
        month: currentMonth.toString(),
        year: currentYear.toString(),
        totalPayment: "",
        telesAmount: "",
        nicoleAmount: "",
        paidStatus: false,
      });
      setShowPaymentForm(false);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteDebtAccount = async (accountId: string) => {
    const { error } = await supabase
      .from("debt_accounts")
      .delete()
      .eq("id", accountId);

    if (!error) {
      setDebtAccounts((prev) => prev.filter((a) => a.id !== accountId));
    }
  };

  const deleteDebtPayment = async (paymentId: string) => {
    const payment = debtPayments.find((p) => p.id === paymentId);

    // Delete the linked bill instance if it exists
    if (payment?.linked_bill_instance_id) {
      await supabase
        .from("bill_instances")
        .delete()
        .eq("id", payment.linked_bill_instance_id);
    }

    const { error } = await supabase
      .from("debt_payments")
      .delete()
      .eq("id", paymentId);

    if (!error) {
      setDebtPayments((prev) => prev.filter((p) => p.id !== paymentId));
    }
  };

  const getAccountName = (accountId: string) => {
    const account = debtAccounts.find((a) => a.id === accountId);
    return account?.name || "Unknown";
  };

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
                <h1 className="text-xl font-semibold tracking-tight">Debt Tracker</h1>
                <p className="text-sm text-muted-foreground">
                  Manage debt accounts and payments
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Debt Accounts Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Debt Accounts
              </CardTitle>
              <CardDescription>
                {debtAccounts.length} account{debtAccounts.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <Button onClick={() => setShowAccountForm(!showAccountForm)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Account
            </Button>
          </CardHeader>
          <CardContent>
            {showAccountForm && (
              <form onSubmit={createDebtAccount} className="mb-6 space-y-4 rounded-lg border p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="accountName">Account Name</Label>
                    <Input
                      id="accountName"
                      placeholder="e.g., Chase Credit Card"
                      required
                      value={accountForm.name}
                      onChange={(e) =>
                        setAccountForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="originalAmount">Original Amount ($)</Label>
                    <Input
                      id="originalAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      required
                      value={accountForm.originalAmount}
                      onChange={(e) =>
                        setAccountForm((prev) => ({
                          ...prev,
                          originalAmount: e.target.value,
                        }))
                      }
                      disabled={submitting}
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="currentBalance">Current Balance ($)</Label>
                    <Input
                      id="currentBalance"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      required
                      value={accountForm.currentBalance}
                      onChange={(e) =>
                        setAccountForm((prev) => ({
                          ...prev,
                          currentBalance: e.target.value,
                        }))
                      }
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="targetPayoffDate">Target Payoff Date (Optional)</Label>
                    <Input
                      id="targetPayoffDate"
                      type="date"
                      value={accountForm.targetPayoffDate}
                      onChange={(e) =>
                        setAccountForm((prev) => ({
                          ...prev,
                          targetPayoffDate: e.target.value,
                        }))
                      }
                      disabled={submitting}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountNotes">Notes (Optional)</Label>
                  <Textarea
                    id="accountNotes"
                    placeholder="Add any notes about this debt..."
                    value={accountForm.notes}
                    onChange={(e) =>
                      setAccountForm((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    disabled={submitting}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAccountForm(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Account
                  </Button>
                </div>
              </form>
            )}

            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : debtAccounts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No debt accounts yet. Click "Add Account" to create one.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Original</TableHead>
                    <TableHead className="text-right">Current Balance</TableHead>
                    <TableHead>Target Payoff</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {debtAccounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className="font-medium">{account.name}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(account.original_amount)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(account.current_balance)}
                      </TableCell>
                      <TableCell>
                        {account.target_payoff_date
                          ? format(new Date(account.target_payoff_date), "MMM d, yyyy")
                          : "-"}
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
                              <AlertDialogTitle>Delete Debt Account</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{account.name}"? All associated
                                payments will also be deleted. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteDebtAccount(account.id)}
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

        {/* Debt Payments Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Debt Payments</CardTitle>
              <CardDescription>
                {debtPayments.length} payment{debtPayments.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <Button
              onClick={() => setShowPaymentForm(!showPaymentForm)}
              disabled={debtAccounts.length === 0}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Payment
            </Button>
          </CardHeader>
          <CardContent>
            {debtAccounts.length === 0 && (
              <div className="text-center py-4 text-muted-foreground mb-4">
                Create a debt account first before adding payments.
              </div>
            )}

            {showPaymentForm && (
              <form onSubmit={createDebtPayment} className="mb-6 space-y-4 rounded-lg border p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Debt Account</Label>
                    <Select
                      value={paymentForm.debtAccountId}
                      onValueChange={(value) =>
                        setPaymentForm((prev) => ({ ...prev, debtAccountId: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select account..." />
                      </SelectTrigger>
                      <SelectContent>
                        {debtAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name} ({formatCurrency(account.current_balance)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paymentDate">Payment Date</Label>
                    <Input
                      id="paymentDate"
                      type="date"
                      required
                      value={paymentForm.paymentDate}
                      onChange={(e) =>
                        setPaymentForm((prev) => ({ ...prev, paymentDate: e.target.value }))
                      }
                      disabled={submitting}
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="totalPayment">Total Payment ($)</Label>
                    <Input
                      id="totalPayment"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      required
                      value={paymentForm.totalPayment}
                      onChange={(e) => handlePaymentAmountChange(e.target.value)}
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telesPayment">Teles Amount ($)</Label>
                    <Input
                      id="telesPayment"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      required
                      value={paymentForm.telesAmount}
                      onChange={(e) =>
                        setPaymentForm((prev) => ({ ...prev, telesAmount: e.target.value }))
                      }
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nicolePayment">Nicole Amount ($)</Label>
                    <Input
                      id="nicolePayment"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      required
                      value={paymentForm.nicoleAmount}
                      onChange={(e) =>
                        setPaymentForm((prev) => ({ ...prev, nicoleAmount: e.target.value }))
                      }
                      disabled={submitting}
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Month</Label>
                    <Select
                      value={paymentForm.month}
                      onValueChange={(value) =>
                        setPaymentForm((prev) => ({ ...prev, month: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Year</Label>
                    <Select
                      value={paymentForm.year}
                      onValueChange={(value) =>
                        setPaymentForm((prev) => ({ ...prev, year: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map((y) => (
                          <SelectItem key={y} value={y.toString()}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center pt-8">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="paidStatus"
                        checked={paymentForm.paidStatus}
                        onCheckedChange={(checked) =>
                          setPaymentForm((prev) => ({
                            ...prev,
                            paidStatus: checked === true,
                          }))
                        }
                        disabled={submitting}
                      />
                      <Label htmlFor="paidStatus" className="font-normal">
                        Mark as paid
                      </Label>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowPaymentForm(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Payment
                  </Button>
                </div>
              </form>
            )}

            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : debtPayments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No debt payments yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Paid</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Payment</TableHead>
                    <TableHead className="text-right text-blue-600 dark:text-blue-400">
                      Teles
                    </TableHead>
                    <TableHead className="text-right text-green-600 dark:text-green-400">
                      Nicole
                    </TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {debtPayments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <Checkbox checked={payment.paid_status} />
                      </TableCell>
                      <TableCell>{getAccountName(payment.debt_account_id)}</TableCell>
                      <TableCell>
                        {format(new Date(payment.payment_date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        {MONTHS.find((m) => m.value === payment.month.toString())?.label}{" "}
                        {payment.year}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(payment.total_payment)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(payment.teles_amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(payment.nicole_amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {payment.remaining_balance_after_payment !== null
                          ? formatCurrency(payment.remaining_balance_after_payment)
                          : "-"}
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
                              <AlertDialogTitle>Delete Payment</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this payment? The linked bill
                                instance will also be deleted. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteDebtPayment(payment.id)}
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
