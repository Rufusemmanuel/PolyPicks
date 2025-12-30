const EXPORT_LOCALE = 'en-US';

const dateFormatter = new Intl.DateTimeFormat(EXPORT_LOCALE, {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat(EXPORT_LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
});

const timestampFormatter = new Intl.DateTimeFormat(EXPORT_LOCALE, {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatPrice = (price: number | null) =>
  price != null ? `${(price * 100).toFixed(1)}c` : 'N/A';

export const formatSignedCents = (value: number | null) => {
  if (value == null) return 'N/A';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value * 100).toFixed(1)}c`;
};

export const formatPct = (value: number | null) => {
  if (value == null) return 'N/A';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(1)}%`;
};

export const formatDate = (iso: string) => dateFormatter.format(new Date(iso));

export const formatTime = (iso: string) => timeFormatter.format(new Date(iso));

export const formatTimestamp = (iso: string) =>
  timestampFormatter.format(new Date(iso));
