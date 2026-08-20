import { cn } from "@/lib/utils";

interface StepperProps {
  steps: string[];
  currentStep: number;
}

export function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <ol className="flex flex-wrap items-center gap-y-2">
      {steps.map((step, index) => {
        const isActive = index === currentStep;
        const isDone = index < currentStep;
        return (
          <li key={step} className="flex items-center">
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                isActive && "bg-primary text-primary-foreground",
                isDone && "bg-primary/20 text-primary",
                !isActive && !isDone && "bg-secondary text-muted-foreground"
              )}
            >
              {index + 1}
            </span>
            <span
              className={cn(
                "ml-2 text-sm",
                isActive ? "font-medium text-foreground" : "text-muted-foreground"
              )}
            >
              {step}
            </span>
            {index < steps.length - 1 && <span className="mx-3 h-px w-8 bg-border" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
