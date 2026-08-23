import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

function ErrorState({ title = "Something went wrong", description = "We couldn't load this information. Please try again.", onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-12 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-red-50">
        <RefreshCw className="size-6 text-red-500" />
      </div>
      <h3 className="mb-1 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mb-6 max-w-sm text-sm text-muted-foreground">{description}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline">
          <RefreshCw className="mr-2 size-4" />
          Try Again
        </Button>
      )}
    </div>
  );
}

export { ErrorState };
