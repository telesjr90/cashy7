import { cn } from "@/lib/utils";

type ResponsiveListCardProps = {
  testId?: string;
  className?: string;
  children: React.ReactNode;
};

export function ResponsiveListCard({
  testId,
  className,
  children,
}: ResponsiveListCardProps) {
  return (
    <article
      className={cn(
        "min-w-0 space-y-3 rounded-lg border bg-card p-4",
        className
      )}
      data-testid={testId}
    >
      {children}
    </article>
  );
}
