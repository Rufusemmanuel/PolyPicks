import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { EXPORT_BRAND } from './historyExportBrand';
import {
  formatDate,
  formatPct,
  formatPrice,
  formatSignedCents,
  formatTime,
  formatTimestamp,
} from './historyExportFormat';
import type { HistoryExportRow, HistoryExportSummary } from './historyExportTypes';

type Props = {
  rows: HistoryExportRow[];
  summary: HistoryExportSummary;
  userName?: string | null;
  generatedAt: string;
};

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    color: '#0f172a',
    fontFamily: 'Helvetica',
    backgroundColor: 'white',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
  },
  subtitle: {
    marginTop: 4,
    color: '#64748b',
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: EXPORT_BRAND.primary,
    color: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 700,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  summaryCard: {
    flexGrow: 1,
    border: `1px solid ${EXPORT_BRAND.border}`,
    borderRadius: 8,
    backgroundColor: EXPORT_BRAND.stripe,
    padding: 8,
  },
  summaryLabel: {
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#64748b',
  },
  summaryValue: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: 700,
  },
  table: {
    border: `1px solid ${EXPORT_BRAND.border}`,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: EXPORT_BRAND.primary,
    color: 'white',
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottom: `1px solid ${EXPORT_BRAND.border}`,
  },
  cellMarket: { width: '22%' },
  cellCategory: { width: '12%' },
  cellBookmarked: { width: '14%' },
  cellEntry: { width: '9%' },
  cellFinal: { width: '12%' },
  cellPL: { width: '9%' },
  cellReturn: { width: '9%' },
  cellStatus: { width: '13%' },
  headerText: {
    fontSize: 9,
    fontWeight: 700,
  },
  bodyText: {
    fontSize: 9,
    color: '#334155',
  },
  statusPill: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 12,
    fontSize: 8,
    fontWeight: 700,
    alignSelf: 'flex-start',
  },
  footer: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    color: '#94a3b8',
    fontSize: 8,
  },
});

const statusColors: Record<HistoryExportRow['status'], { bg: string; text: string }> = {
  Closed: { bg: '#dcfce7', text: '#166534' },
  Removed: { bg: '#fee2e2', text: '#991b1b' },
  Active: { bg: '#dbeafe', text: '#1e40af' },
};

export function HistoryPdf({ rows, summary, userName, generatedAt }: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <View>
            <Text style={{ letterSpacing: 2, fontSize: 9, color: '#64748b' }}>
              POLYPICKS
            </Text>
            <Text style={styles.title}>Trade History</Text>
            <Text style={styles.subtitle}>
              {userName ? `${userName} · ` : ''}
              {formatTimestamp(generatedAt)}
            </Text>
          </View>
          <View style={styles.badge}>
            <Text>PP</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Trades</Text>
            <Text style={styles.summaryValue}>{summary.count}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Win rate</Text>
            <Text style={styles.summaryValue}>
              {summary.winRate == null ? 'N/A' : `${summary.winRate.toFixed(1)}%`}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total P/L</Text>
            <Text style={styles.summaryValue}>{formatSignedCents(summary.totalPL)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Best / Worst</Text>
            <Text style={{ marginTop: 4, fontSize: 9, fontWeight: 700 }}>
              {summary.best?.title ?? 'N/A'}
            </Text>
            <Text style={{ fontSize: 8, color: '#64748b' }}>
              {summary.worst?.title ?? 'N/A'}
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerText, styles.cellMarket]}>Market</Text>
            <Text style={[styles.headerText, styles.cellCategory]}>Category</Text>
            <Text style={[styles.headerText, styles.cellBookmarked]}>Bookmarked</Text>
            <Text style={[styles.headerText, styles.cellEntry]}>Entry</Text>
            <Text style={[styles.headerText, styles.cellFinal]}>Final/Current</Text>
            <Text style={[styles.headerText, styles.cellPL]}>P/L</Text>
            <Text style={[styles.headerText, styles.cellReturn]}>Return</Text>
            <Text style={[styles.headerText, styles.cellStatus]}>Status</Text>
          </View>

          {rows.map((row, index) => {
            const stripe = index % 2 === 0 ? EXPORT_BRAND.stripe : 'white';
            const statusStyle = statusColors[row.status];
            return (
              <View key={row.id} style={[styles.tableRow, { backgroundColor: stripe }]}>
                <Text style={[styles.bodyText, styles.cellMarket]}>
                  {row.title ?? 'Unknown market'}
                </Text>
                <Text style={[styles.bodyText, styles.cellCategory]}>
                  {row.category ?? 'Unknown'}
                </Text>
                <View style={styles.cellBookmarked}>
                  <Text style={styles.bodyText}>{formatDate(row.createdAt)}</Text>
                  <Text style={{ fontSize: 8, color: '#94a3b8' }}>
                    {formatTime(row.createdAt)}
                  </Text>
                </View>
                <Text style={[styles.bodyText, styles.cellEntry]}>
                  {formatPrice(row.entryPrice)}
                </Text>
                <Text style={[styles.bodyText, styles.cellFinal]}>
                  {formatPrice(row.latestPrice)}
                </Text>
                <Text style={[styles.bodyText, styles.cellPL]}>
                  {formatSignedCents(row.profitDelta)}
                </Text>
                <Text style={[styles.bodyText, styles.cellReturn]}>
                  {formatPct(row.returnPct)}
                </Text>
                <View style={styles.cellStatus}>
                  <Text
                    style={[
                      styles.statusPill,
                      { backgroundColor: statusStyle.bg, color: statusStyle.text },
                    ]}
                  >
                    {row.status}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.footer} fixed>
          <Text>Generated by PolyPicks</Text>
          <Text>polypicks.app</Text>
        </View>
      </Page>
    </Document>
  );
}
