import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import type { Bill, BillInstance, CashPaymentTransaction, Person } from "@/lib/types";
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
  LayoutTemplate,
  Archive,
  Sparkles,
  AlertTriangle,
  Search,
  Eye,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_BILL_INSTANCE_FILTERS,
  extractDistinctBillCategories,
  filterBillInstances,
  getActiveBillFilterLabels,
  isBillInstanceFiltersActive,
  type BillInstanceFilters,
} from "@/lib/bill-filters";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/format";
import { canEditRegularBill } from "@/lib/bill-edit";
import {
  billTemplateActiveStatusLabel,
  buildBillTemplateDeactivateUpdate,
  getBillInstanceSourceLabel,
  getBillTemplateActiveStatus,
  isEligibleBillTemplate,
} from "@/lib/bill-templates";
import { BillDetailPanel } from "@/components/bill-detail-panel";
import { BillEditPanel } from "@/components/bill-edit-panel";
import { BillGenerationDialog } from "@/components/bill-generation-dialog";
import { BillTemplatePanel } from "@/components/bill-template-panel";
import {
  buildBillInstanceDetailView,
  resolveBillPaymentTransaction,
} from "@/lib/bill-detail";
import { Badge } from "@/components/ui/badge";
import {
  DEBT_LINKED_BILL_DELETE_MESSAGE,
  DEBT_LINKED_BILL_EDIT_MESSAGE,
  fetchDebtLinkedBillContext,
  syncBillPaidStatusWithDebt,
} from "@/lib/sync-bill-paid-status";
import {
  buildBillTemplateLookup,
  countVariableBillsNeedingConfirmation,
  isGeneratedVariableBillInstance,
  needsVariableAmountConfirmation,
  VARIABLE_AMOUNT_CONFIRMATION_MESSAGE,
} from "@/lib/variable-bills";

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
  const [templates, setTemplates] = useState<Bill[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Bill | null>(null);
  const [deactivatingTemplateId, setDeactivatingTemplateId] = useState<string | null>(
    null
  );
  const [generationDialogOpen, setGenerationDialogOpen] = useState(false);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<BillInstanceFilters>(
    DEFAULT_BILL_INSTANCE_FILTERS
  );
  const [detailBillId, setDetailBillId] = useState<string | null>(null);

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

  const fetchTemplates = useCallback(async () => {
    if (!household) return;

    setTemplatesLoading(true);

    const { data, error } = await supabase
      .from("bills")
      .select("*")
      .eq("household_id", household.id)
      .eq("recurring", true)
      .order("name");

    if (!error && data) {
      setTemplates((data as Bill[]).filter(isEligibleBillTemplate));
    }

    setTemplatesLoading(false);
  }, [household]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

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

  const editingBillTemplate = useMemo(() => {
    if (!editingBill?.bill_id) {
      return null;
    }

    return templates.find((template) => template.id === editingBill.bill_id) ?? null;
  }, [editingBill, templates]);

  const startEditBill = (bill: BillInstance) => {
    if (!canEditRegularBill(isDebtLinkedBill(bill.id))) {
      return;
    }
    setEditingBillId(bill.id);
  };

  const handleBillSaved = (updatedBill: BillInstance) => {
    setBills((prev) =>
      prev.map((bill) => (bill.id === updatedBill.id ? updatedBill : bill))
    );
    setEditingBillId(null);
  };

  const handleTemplateAndFutureSaved = ({
    template,
    updatedInstances,
  }: {
    template: Bill;
    updatedInstances: BillInstance[];
  }) => {
    setTemplates((prev) =>
      prev.map((row) => (row.id === template.id ? template : row))
    );

    setBills((prev) => {
      const byId = new Map(prev.map((bill) => [bill.id, bill]));
      for (const instance of updatedInstances) {
        if (instance.year === year && instance.month === month) {
          byId.set(instance.id, instance);
        }
      }
      return Array.from(byId.values()).sort((left, right) => {
        if (left.period_bucket !== right.period_bucket) {
          return left.period_bucket.localeCompare(right.period_bucket);
        }
        return left.name.localeCompare(right.name);
      });
    });
    setEditingBillId(null);
  };

  const openCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplatePanelOpen(true);
  };

  const openEditTemplate = (template: Bill) => {
    setEditingTemplate(template);
    setTemplatePanelOpen(true);
  };

  const handleTemplateSaved = (template: Bill) => {
    setTemplates((prev) => {
      const existingIndex = prev.findIndex((row) => row.id === template.id);
      if (existingIndex === -1) {
        return [...prev, template].sort((left, right) =>
          left.name.localeCompare(right.name)
        );
      }

      return prev.map((row) => (row.id === template.id ? template : row));
    });
    setEditingTemplate(null);
  };

  const deactivateTemplate = async (templateId: string) => {
    setDeactivatingTemplateId(templateId);

    const { data, error } = await supabase
      .from("bills")
      .update(buildBillTemplateDeactivateUpdate())
      .eq("id", templateId)
      .select("*")
      .single();

    setDeactivatingTemplateId(null);

    if (!error && data) {
      setTemplates((prev) =>
        prev.map((row) => (row.id === templateId ? (data as Bill) : row))
      );
    }
  };

  const handleBillsGenerated = (instances: BillInstance[], summaryMessage: string) => {
    setGenerationMessage(summaryMessage);
    setBills((prev) => {
      const merged = [...prev];
      for (const instance of instances) {
        const existingIndex = merged.findIndex((row) => row.id === instance.id);
        if (existingIndex === -1) {
          merged.push(instance);
        } else {
          merged[existingIndex] = instance;
        }
      }
      return merged.sort((left, right) => {
        if (left.period_bucket !== right.period_bucket) {
          return left.period_bucket.localeCompare(right.period_bucket);
        }
        return left.name.localeCompare(right.name);
      });
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

  const variableBillContext = useMemo(
    () => ({
      templateByBillId: buildBillTemplateLookup(templates),
      debtLinkedBillIds,
    }),
    [templates, debtLinkedBillIds]
  );

  const variableConfirmationCount = useMemo(
    () => countVariableBillsNeedingConfirmation(bills, variableBillContext),
    [bills, variableBillContext]
  );

  const templateCategoryByBillId = useMemo(
    () =>
      new Map(
        templates.map((template) => [template.id, template.category ?? "other"])
      ),
    [templates]
  );

  const cashDeductedBillIds = useMemo(() => {
    const ids = new Set<string>();
    for (const bill of bills) {
      if (billHasCashDeduction(bill.id)) {
        ids.add(bill.id);
      }
    }
    return ids;
  }, [bills, billHasCashDeduction]);

  const billFilterContext = useMemo(
    () => ({
      debtLinkedBillIds,
      cashDeductedBillIds,
      templateCategoryByBillId,
      variableBillContext,
    }),
    [
      debtLinkedBillIds,
      cashDeductedBillIds,
      templateCategoryByBillId,
      variableBillContext,
    ]
  );

  const filtersActive = useMemo(
    () => isBillInstanceFiltersActive(filters),
    [filters]
  );

  const activeFilterLabels = useMemo(
    () => getActiveBillFilterLabels(filters),
    [filters]
  );

  const derivedCategories = useMemo(
    () =>
      extractDistinctBillCategories(
        bills,
        templateCategoryByBillId,
        templates
      ),
    [bills, templateCategoryByBillId, templates]
  );

  const displayedBills = useMemo(
    () => filterBillInstances(bills, filters, billFilterContext),
    [bills, filters, billFilterContext]
  );

  const detailBill =
    detailBillId !== null
      ? (bills.find((bill) => bill.id === detailBillId) ?? null)
      : null;

  const detailView = useMemo(() => {
    if (!detailBill) {
      return null;
    }

    const template =
      detailBill.bill_id != null
        ? (templates.find((row) => row.id === detailBill.bill_id) ?? null)
        : null;

    return buildBillInstanceDetailView({
      bill: detailBill,
      template,
      templateCategory: detailBill.bill_id
        ? (templateCategoryByBillId.get(detailBill.bill_id) ??
            template?.category ??
            null)
        : null,
      isDebtLinked: isDebtLinkedBill(detailBill.id),
      hasCashDeduction: billHasCashDeduction(detailBill.id),
      paymentTransaction: resolveBillPaymentTransaction(
        detailBill.id,
        paymentByBillId,
        debtPaymentIdByBillId,
        paymentByDebtPaymentId
      ),
      debtPaymentId: debtPaymentIdByBillId.get(detailBill.id) ?? null,
      variableBillContext,
    });
  }, [
    detailBill,
    templates,
    templateCategoryByBillId,
    debtLinkedBillIds,
    debtPaymentIdByBillId,
    paymentByBillId,
    paymentByDebtPaymentId,
    variableBillContext,
    billHasCashDeduction,
  ]);

  const resetFilters = () => {
    setFilters(DEFAULT_BILL_INSTANCE_FILTERS);
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

        {generationMessage && (
          <Alert className="mb-4">
            <AlertDescription>{generationMessage}</AlertDescription>
          </Alert>
        )}

        {variableConfirmationCount > 0 && (
          <Alert className="mb-4 border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {variableConfirmationCount} variable bill
              {variableConfirmationCount === 1 ? "" : "s"} in this month still need
              a confirmed amount. {VARIABLE_AMOUNT_CONFIRMATION_MESSAGE}{" "}
              <Button
                variant="link"
                className="h-auto p-0 text-amber-950 underline dark:text-amber-100"
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    variable: "needs_confirmation",
                  }))
                }
              >
                Show bills needing confirmation
              </Button>
            </AlertDescription>
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

        <Card className="mb-6">
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <LayoutTemplate className="h-5 w-5" />
                Bill Templates
              </CardTitle>
              <CardDescription className="mt-1.5 max-w-2xl">
                Recurring templates define default name, amount, due day, and split.
                Monthly bill instances for each month are generated separately — editing
                a template does not change past or paid instances.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={openCreateTemplate}>
                <Plus className="mr-2 h-4 w-4" />
                New template
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  setGenerationMessage(null);
                  setGenerationDialogOpen(true);
                }}
                disabled={templatesLoading || templates.length === 0}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Generate monthly bills
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {templatesLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-muted-foreground">No recurring bill templates yet</p>
                <Button variant="link" className="mt-2" onClick={openCreateTemplate}>
                  Create your first template
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Template</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due day</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Default amount</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="w-28"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => {
                    const status = getBillTemplateActiveStatus(template);
                    const statusLabel = billTemplateActiveStatusLabel(status);

                    return (
                      <TableRow key={template.id}>
                        <TableCell>
                          <div className="font-medium">{template.name}</div>
                          {template.is_variable && (
                            <Badge variant="outline" className="mt-1">
                              Variable amount
                            </Badge>
                          )}
                          {template.notes && (
                            <p className="mt-1 text-xs text-muted-foreground truncate max-w-xs">
                              {template.notes}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              status === "active"
                                ? "default"
                                : status === "inactive"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {statusLabel}
                          </Badge>
                        </TableCell>
                        <TableCell>{template.due_day ?? "—"}</TableCell>
                        <TableCell>
                          {template.period_bucket === "1_14" ? "1st-14th" : "15th-EOM"}
                        </TableCell>
                        <TableCell className="text-right">
                          {template.is_variable && template.default_amount == null
                            ? "Varies"
                            : formatCurrency(Number(template.default_amount ?? 0))}
                        </TableCell>
                        <TableCell className="capitalize">
                          {template.category || "other"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Edit template"
                              onClick={() => openEditTemplate(template)}
                            >
                              <Pencil className="h-4 w-4 text-muted-foreground" />
                            </Button>
                            {template.is_active && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Deactivate template"
                                    disabled={deactivatingTemplateId === template.id}
                                  >
                                    <Archive className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Deactivate template</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Deactivating "{template.name}" stops it from being
                                      used for new bill generation. Existing monthly bill
                                      instances are unchanged.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => void deactivateTemplate(template.id)}
                                    >
                                      Deactivate
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

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Bills for {MONTHS[month - 1]} {year}</CardTitle>
              <CardDescription>
                {bills.length} bill{bills.length !== 1 ? "s" : ""} total.{" "}
                {PAYMENT_UX_EXPLANATION}
                {filtersActive && bills.length > 0 && (
                  <>
                    {" "}
                    Showing {displayedBills.length} of {bills.length} bills.
                  </>
                )}
              </CardDescription>
            </div>
            {variableConfirmationCount > 0 && (
              <Button
                variant={
                  filters.variable === "needs_confirmation" ? "default" : "outline"
                }
                size="sm"
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    variable:
                      prev.variable === "needs_confirmation"
                        ? "all"
                        : "needs_confirmation",
                  }))
                }
              >
                Needs confirmation ({variableConfirmationCount})
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!loading && bills.length > 0 && (
              <div className="mb-4 space-y-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[12rem] flex-1 space-y-1">
                    <Label htmlFor="bill-search">Search</Label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="bill-search"
                        value={filters.searchText}
                        onChange={(event) =>
                          setFilters((prev) => ({
                            ...prev,
                            searchText: event.target.value,
                          }))
                        }
                        placeholder="Name, category, notes, source..."
                        className="pl-9"
                      />
                    </div>
                  </div>
                  {filtersActive && (
                    <Button type="button" variant="outline" onClick={resetFilters}>
                      Clear filters
                    </Button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label htmlFor="bill-filter-period">Period bucket</Label>
                    <Select
                      value={filters.periodBucket}
                      onValueChange={(value) =>
                        setFilters((prev) => ({
                          ...prev,
                          periodBucket: value as BillInstanceFilters["periodBucket"],
                        }))
                      }
                    >
                      <SelectTrigger id="bill-filter-period">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All periods</SelectItem>
                        <SelectItem value="1_14">1st–14th</SelectItem>
                        <SelectItem value="15_eom">15th–end of month</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="bill-filter-paid">Paid status</Label>
                    <Select
                      value={filters.paidStatus}
                      onValueChange={(value) =>
                        setFilters((prev) => ({
                          ...prev,
                          paidStatus: value as BillInstanceFilters["paidStatus"],
                        }))
                      }
                    >
                      <SelectTrigger id="bill-filter-paid">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="unpaid">Unpaid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="bill-filter-cash">Cash deducted</Label>
                    <Select
                      value={filters.cashDeducted}
                      onValueChange={(value) =>
                        setFilters((prev) => ({
                          ...prev,
                          cashDeducted: value as BillInstanceFilters["cashDeducted"],
                        }))
                      }
                    >
                      <SelectTrigger id="bill-filter-cash">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="cash_deducted">Cash deducted</SelectItem>
                        <SelectItem value="not_cash_deducted">
                          Not cash deducted
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="bill-filter-debt">Debt-linked</Label>
                    <Select
                      value={filters.debtLinked}
                      onValueChange={(value) =>
                        setFilters((prev) => ({
                          ...prev,
                          debtLinked: value as BillInstanceFilters["debtLinked"],
                        }))
                      }
                    >
                      <SelectTrigger id="bill-filter-debt">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All bills</SelectItem>
                        <SelectItem value="debt_linked">Debt-linked</SelectItem>
                        <SelectItem value="regular_only">Regular only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="bill-filter-source">Source</Label>
                    <Select
                      value={filters.source}
                      onValueChange={(value) =>
                        setFilters((prev) => ({
                          ...prev,
                          source: value as BillInstanceFilters["source"],
                        }))
                      }
                    >
                      <SelectTrigger id="bill-filter-source">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All sources</SelectItem>
                        <SelectItem value="generated_from_template">
                          Generated from template
                        </SelectItem>
                        <SelectItem value="manual_instance">Manual instance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="bill-filter-variable">Variable amount</Label>
                    <Select
                      value={filters.variable}
                      onValueChange={(value) =>
                        setFilters((prev) => ({
                          ...prev,
                          variable: value as BillInstanceFilters["variable"],
                        }))
                      }
                    >
                      <SelectTrigger id="bill-filter-variable">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All bills</SelectItem>
                        <SelectItem value="variable">Variable</SelectItem>
                        <SelectItem value="fixed">Fixed</SelectItem>
                        <SelectItem value="needs_confirmation">
                          Needs confirmation
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="bill-filter-category">Category</Label>
                    <Select
                      value={filters.category || "all"}
                      onValueChange={(value) =>
                        setFilters((prev) => ({
                          ...prev,
                          category: value === "all" ? "" : value,
                        }))
                      }
                    >
                      <SelectTrigger id="bill-filter-category">
                        <SelectValue placeholder="All categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {derivedCategories.map((categoryName) => (
                          <SelectItem key={categoryName} value={categoryName}>
                            {categoryName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {filtersActive && activeFilterLabels.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Active filters:</span>
                    {activeFilterLabels.map((label) => (
                      <Badge key={label} variant="secondary">
                        {label}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

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
            ) : displayedBills.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-muted-foreground">No bills match your filters.</p>
                <Button variant="link" className="mt-2" onClick={resetFilters}>
                  Clear filters
                </Button>
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
                  {displayedBills.map((bill) => {
                    const debtLinked = isDebtLinkedBill(bill.id);
                    const cashStatus = getCashDeductionStatus({
                      isMarkedPaid: bill.is_paid,
                      hasPaymentTransaction: billHasCashDeduction(bill.id),
                    });
                    const needsConfirmation = needsVariableAmountConfirmation(
                      bill,
                      variableBillContext
                    );
                    const isGeneratedVariable = isGeneratedVariableBillInstance(
                      bill,
                      variableBillContext
                    );

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
                        {!debtLinked && (
                          <p className="text-xs text-muted-foreground">
                            Source:{" "}
                            {getBillInstanceSourceLabel({
                              billId: bill.bill_id,
                              name: bill.name,
                              notes: bill.notes,
                            })}
                            {isGeneratedVariable ? " · Variable amount" : ""}
                          </p>
                        )}
                        {needsConfirmation && (
                          <Badge
                            variant="outline"
                            className="mt-1 border-amber-500 text-amber-700 dark:text-amber-300"
                          >
                            Confirm amount
                          </Badge>
                        )}
                        {needsConfirmation && (
                          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300 max-w-xs">
                            {VARIABLE_AMOUNT_CONFIRMATION_MESSAGE}
                          </p>
                        )}
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
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`View details for ${bill.name}`}
                            onClick={() => setDetailBillId(bill.id)}
                          >
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          {canEditRegularBill(debtLinked) && needsConfirmation && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => startEditBill(bill)}
                            >
                              Confirm amount
                            </Button>
                          )}
                          {canEditRegularBill(debtLinked) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Edit bill"
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

      <BillEditPanel
        bill={editingBill}
        template={editingBillTemplate}
        householdId={household?.id ?? null}
        isDebtLinked={editingBill ? isDebtLinkedBill(editingBill.id) : false}
        needsAmountConfirmation={
          editingBill
            ? needsVariableAmountConfirmation(editingBill, variableBillContext)
            : false
        }
        hasCashDeduction={billHasCashDeduction}
        debtLinkedBillIds={debtLinkedBillIds}
        open={editingBillId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingBillId(null);
          }
        }}
        onSaved={handleBillSaved}
        onTemplateAndFutureSaved={handleTemplateAndFutureSaved}
      />

      <BillTemplatePanel
        template={editingTemplate}
        open={templatePanelOpen}
        onOpenChange={(open) => {
          setTemplatePanelOpen(open);
          if (!open) {
            setEditingTemplate(null);
          }
        }}
        onSaved={handleTemplateSaved}
      />

      <BillGenerationDialog
        open={generationDialogOpen}
        onOpenChange={setGenerationDialogOpen}
        year={year}
        month={month}
        templates={templates}
        onGenerated={handleBillsGenerated}
      />

      <BillDetailPanel
        detail={detailView}
        open={detailBillId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetailBillId(null);
          }
        }}
      />
    </div>
  );
}
