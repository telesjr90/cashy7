import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import type { Bill } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Loader as Loader2, ArrowLeft } from "lucide-react";
import { split5149 } from "@/lib/format";

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

export function AddBillPage() {
  const { household } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billTemplates, setBillTemplates] = useState<Bill[]>([]);
  const [useTemplate, setUseTemplate] = useState(false);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const currentPeriod = now.getDate() <= 14 ? "1_14" : "15_eom";

  const [formData, setFormData] = useState({
    name: "",
    amount: "",
    telesAmount: "",
    nicoleAmount: "",
    year: currentYear.toString(),
    month: currentMonth.toString(),
    periodBucket: currentPeriod,
    dueDate: "",
    notes: "",
    isPaid: false,
    selectedTemplateId: "",
  });

  useEffect(() => {
    const fetchTemplates = async () => {
      if (!household) return;

      const { data, error } = await supabase
        .from("bills")
        .select("*")
        .eq("household_id", household.id)
        .eq("is_active", true)
        .order("name");

      if (!error && data) {
        setBillTemplates(data as Bill[]);
      }
    };

    fetchTemplates();
  }, [household]);

  const applyTemplate = useCallback((templateId: string) => {
    const template = billTemplates.find((t) => t.id === templateId);
    if (template) {
      const amount = template.default_amount || 0;
      setFormData((prev) => ({
        ...prev,
        selectedTemplateId: templateId,
        name: template.name,
        amount: amount.toString(),
        periodBucket: template.period_bucket,
        telesAmount: split5149(amount).teles.toFixed(2),
        nicoleAmount: split5149(amount).nicole.toFixed(2),
      }));
    }
  }, [billTemplates]);

  const handleAmountChange = (value: string) => {
    const amount = parseFloat(value) || 0;
    const { teles, nicole } = split5149(amount);
    setFormData((prev) => ({
      ...prev,
      amount: value,
      telesAmount: teles.toFixed(2),
      nicoleAmount: nicole.toFixed(2),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!household) {
      setError("No household found");
      return;
    }

    const amount = parseFloat(formData.amount);
    const telesAmount = parseFloat(formData.telesAmount);
    const nicoleAmount = parseFloat(formData.nicoleAmount);

    if (isNaN(amount) || amount <= 0) {
      setError("Please enter a valid bill amount");
      return;
    }

    if (isNaN(telesAmount) || isNaN(nicoleAmount)) {
      setError("Please enter valid amounts for Teles and Nicole");
      return;
    }

    if (Math.abs(telesAmount + nicoleAmount - amount) > 0.01) {
      setError("Teles and Nicole amounts must add up to the total amount");
      return;
    }

    setLoading(true);

    try {
      const { error: insertError } = await supabase
        .from("bill_instances")
        .insert({
          household_id: household.id,
          bill_id: useTemplate && formData.selectedTemplateId ? formData.selectedTemplateId : null,
          year: parseInt(formData.year),
          month: parseInt(formData.month),
          period_bucket: formData.periodBucket as "1_14" | "15_eom",
          name: formData.name,
          amount: amount,
          teles_amount: telesAmount,
          nicole_amount: nicoleAmount,
          due_date: formData.dueDate || null,
          is_paid: formData.isPaid,
          notes: formData.notes || null,
        });

      if (insertError) {
        throw new Error(insertError.message);
      }

      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (!household) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Add Bill</h1>
              <p className="text-sm text-muted-foreground">
                Create a new bill instance
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-2xl px-4 py-6">
        <Card>
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle>Bill Details</CardTitle>
              <CardDescription>
                Enter the bill information for a specific month and pay period.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {billTemplates.length > 0 && (
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label className="text-base">Use Bill Template</Label>
                    <p className="text-sm text-muted-foreground">
                      Auto-fill from a saved template
                    </p>
                  </div>
                  <Switch
                    checked={useTemplate}
                    onCheckedChange={setUseTemplate}
                  />
                </div>
              )}

              {useTemplate && billTemplates.length > 0 && (
                <div className="space-y-2">
                  <Label>Select Template</Label>
                  <Select
                    value={formData.selectedTemplateId}
                    onValueChange={applyTemplate}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {billTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name} - {template.period_bucket === "1_14" ? "1st-14th" : "15th-EOM"}
                          {template.default_amount && ` ($${template.default_amount})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Bill Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="e.g., Electric Bill"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Total Amount ($)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    required
                    value={formData.amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="telesAmount">Teles Amount ($)</Label>
                  <Input
                    id="telesAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    required
                    value={formData.telesAmount}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        telesAmount: e.target.value,
                      }))
                    }
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nicoleAmount">Nicole Amount ($)</Label>
                  <Input
                    id="nicoleAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    required
                    value={formData.nicoleAmount}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        nicoleAmount: e.target.value,
                      }))
                    }
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Month</Label>
                  <Select
                    value={formData.month}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, month: value }))
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
                    value={formData.year}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, year: value }))
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
                <div className="space-y-2">
                  <Label>Pay Period</Label>
                  <Select
                    value={formData.periodBucket}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, periodBucket: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1_14">1st - 14th</SelectItem>
                      <SelectItem value="15_eom">15th - EOM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dueDate">Due Date (Optional)</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, dueDate: e.target.value }))
                    }
                    disabled={loading}
                  />
                </div>
                <div className="flex items-center pt-8">
                  <div className="flex items-center space-x-2">
                    <input
                      id="isPaid"
                      type="checkbox"
                      checked={formData.isPaid}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          isPaid: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-gray-300"
                      disabled={loading}
                    />
                    <Label htmlFor="isPaid" className="font-normal">
                      Mark as paid
                    </Label>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Add any notes about this bill..."
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  disabled={loading}
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/")}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? "Saving..." : "Add Bill"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
