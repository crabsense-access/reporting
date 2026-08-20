import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ScorecardProps {
  label: string;
  value: string;
}

export function Scorecard({ label, value }: ScorecardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}
