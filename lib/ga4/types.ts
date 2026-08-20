export interface BasicMetrics {
  activeUsers: number;
  sessions: number;
  engagementRate: number;
  averageSessionDuration: number;
}

export interface TrendPoint {
  bucket: string;
  value: number;
}

export interface GoalMetric {
  name: string;
  type: "primary" | "secondary";
  total: number;
  previousTotal: number;
  variationPct: number;
  trend: TrendPoint[];
}

export interface GA4TimeSeriesPoint extends BasicMetrics {
  date: string;
}

export interface GA4BreakdownRow {
  key: string;
  current: BasicMetrics;
  previous: BasicMetrics | null;
}

export interface GA4Breakdowns {
  device: GA4BreakdownRow[];
  operatingSystem: GA4BreakdownRow[];
  channel: GA4BreakdownRow[];
  country: GA4BreakdownRow[];
  landingPage: GA4BreakdownRow[];
  newVsReturning: GA4BreakdownRow[];
  hourly: GA4BreakdownRow[];
  dayOfWeek: GA4BreakdownRow[];
}

export interface DashboardMetricsResponse {
  basicMetrics: BasicMetrics | null;
  basicMetricsPrevious: BasicMetrics | null;
  goals: GoalMetric[];
  timeSeries: { current: GA4TimeSeriesPoint[]; previous: GA4TimeSeriesPoint[] } | null;
  breakdowns: GA4Breakdowns | null;
}
