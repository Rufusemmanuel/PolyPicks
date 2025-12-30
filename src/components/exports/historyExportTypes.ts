export type HistoryStatus = 'Closed' | 'Removed' | 'Active';

export type HistoryExportRow = {
  id: string;
  title: string | null;
  category: string | null;
  createdAt: string;
  entryPrice: number;
  latestPrice: number | null;
  profitDelta: number | null;
  returnPct: number | null;
  status: HistoryStatus;
};

export type HistoryExportSummary = {
  count: number;
  winRate: number | null;
  totalPL: number;
  best: { title: string | null; returnPct: number | null } | null;
  worst: { title: string | null; returnPct: number | null } | null;
};
