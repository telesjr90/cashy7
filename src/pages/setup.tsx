import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

export function SetupPage() {
  const [householdName, setHouseholdName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { user, refreshHousehold } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) {
      setError("You must be signed in to create a household");
      return;
    }

    if (!householdName.trim()) {
      setError("Please enter a household name");
      return;
    }

    setLoading(true);

    try {
      const { data: household, error: householdError } = await supabase
        .from("households")
        .insert({
          name: householdName.trim(),
          owner_id: user.id,
        })
        .select()
        .single();

      if (householdError) {
        throw new Error(householdError.message);
      }

      const { error: memberError } = await supabase
        .from("household_members")
        .insert({
          household_id: household.id,
          user_id: user.id,
          is_owner: true,
          is_active: true,
        });

      if (memberError) {
        throw new Error(memberError.message);
      }

      const { error: peopleError } = await supabase.from("people").insert([
        {
          household_id: household.id,
          name: "Teles",
          color: "#3b82f6",
        },
        {
          household_id: household.id,
          name: "Nicole",
          color: "#22c55e",
        },
      ]);

      if (peopleError) {
        throw new Error(peopleError.message);
      }

      await refreshHousehold();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Set Up Your Household</CardTitle>
          <CardDescription>
            Create your household to start managing your cashflow together.
            You'll be the owner and can manage the household settings.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="grid gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2">
              <Label htmlFor="householdName">Household Name</Label>
              <Input
                id="householdName"
                type="text"
                placeholder="e.g., Teles & Nicole's Household"
                required
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                disabled={loading}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              We'll create two people for your household:
            </p>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-blue-500" />
                <span className="text-sm font-medium">Teles</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-green-500" />
                <span className="text-sm font-medium">Nicole</span>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Creating..." : "Create Household"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
