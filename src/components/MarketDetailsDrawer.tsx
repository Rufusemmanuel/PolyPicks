import { formatDistanceToNow } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import type { MarketDetailsResponse } from '@/lib/polymarket/types';

type Props = {
  marketId: string | null;
  isOpen: boolean;
  isDark: boolean;
  onClose: () => void;
};

export function MarketDetailsDrawer({ marketId, isOpen, isDark, onClose }: Props) {
  const [details, setDetails] = useState<MarketDetailsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'about' | 'stats'>('overview');

  useEffect(() => {
    if (!isOpen || !marketId) return;
    let isMounted = true;
    setLoading(true);
    setError(null);
    fetch(`/api/market/${marketId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Unable to load market details');
        return res.json();
      })
      .then((data: MarketDetailsResponse) => {
        if (isMounted) setDetails(data);
      })
      .catch((err: Error) => {
        if (isMounted) setError(err.message);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, marketId]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab('overview');
  }, [isOpen]);

  const isLive = details ? new Date(details.closesAt).getTime() > Date.now() : false;
  const timeLeft = useMemo(() => {
    if (!details) return null;
    if (!isLive) return 'Closed';
    return formatDistanceToNow(new Date(details.closesAt), { addSuffix: true });
  }, [details, isLive]);

  const currentProbPct = details ? (details.leading.prob * 100).toFixed(1) : null;
  const isInRange =
    details &&
    details.highConfidence.currentProb >= details.highConfidence.min &&
    details.highConfidence.currentProb <= details.highConfidence.max;
  type MatchItem = NonNullable<MarketDetailsResponse['sports']>['recentA'][number];

  const formatMatchMeta = (match: MatchItem) => {
    const date = match.utcDate ? new Date(match.utcDate) : null;
    const dateLabel = date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : null;
    const metaParts = [dateLabel, match.competition].filter(Boolean);
    return metaParts.join(' | ');
  };

  const renderMatchLine = (match: MatchItem, teamName?: string) => {
    if (teamName === match.homeTeam) {
      return `${match.awayTeam} ${match.homeScore ?? '-'}-${match.awayScore ?? '-'}`;
    }
    if (teamName === match.awayTeam) {
      return `${match.homeTeam} ${match.awayScore ?? '-'}-${match.homeScore ?? '-'}`;
    }
    return `${match.homeTeam} ${match.homeScore ?? '-'}-${match.awayScore ?? '-'} ${match.awayTeam}`;
  };

  const MatchList = ({
    title,
    matches,
    teamName,
  }: {
    title: string;
    matches: MatchItem[];
    teamName?: string;
  }) => (
    <div className="space-y-2">
      <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>{title}</p>
      <ul className="space-y-2 text-sm">
        {matches.map((match) => {
          const meta = formatMatchMeta(match);
          return (
            <li key={`${match.utcDate}-${match.homeTeam}-${match.awayTeam}`} className="space-y-1">
              <p className={isDark ? 'text-slate-200' : 'text-slate-800'}>
                {renderMatchLine(match, teamName)}
              </p>
              {meta && (
                <p className={isDark ? 'text-slate-500' : 'text-slate-400'}>{meta}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close market details"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        className={`absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l p-6 shadow-2xl ${
          isDark
            ? 'border-slate-800 bg-[#0b1224] text-slate-100'
            : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        {loading && (
          <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>Loading details...</p>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {!loading && !error && details && (
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      isDark
                        ? 'border-slate-700 bg-slate-900 text-slate-100'
                        : 'border-slate-200 bg-slate-100 text-slate-700'
                    }`}
                  >
                    {details.categoryResolved}
                  </span>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      isDark
                        ? 'border-blue-800 bg-blue-900/40 text-blue-100'
                        : 'border-blue-200 bg-blue-50 text-[#002cff]'
                    }`}
                  >
                    {isLive ? 'Live' : 'Closed'}
                  </span>
                </div>
                <h2 className="text-2xl font-semibold">{details.title}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  isDark
                    ? 'border-slate-600 text-slate-200 hover:border-slate-400'
                    : 'border-slate-300 text-slate-700 hover:border-slate-500'
                }`}
              >
                Close
              </button>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
              {(['overview', 'about', 'stats'] as const).map((tab) => {
                if (tab === 'stats' && details.categoryResolved !== 'Sports') return null;
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-full border px-4 py-1 text-xs font-semibold uppercase tracking-wide ${
                      isActive
                        ? 'border-blue-400 text-blue-200'
                        : isDark
                          ? 'border-slate-700 text-slate-300'
                          : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>

            {activeTab === 'overview' && (
              <>
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-400">
                    Key stats
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>Leading side</p>
                      <p className="text-lg font-semibold">
                        {currentProbPct}% ({details.leading.outcome},{' '}
                        {details.leading.price.toFixed(3)})
                      </p>
                    </div>
                    <div>
                      <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>Volume</p>
                      <p className="text-lg font-semibold">
                        ${Intl.NumberFormat().format(details.volume)}
                      </p>
                    </div>
                    <div>
                      <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>Closes</p>
                      <p className="text-sm font-semibold">
                        {new Date(details.closesAt).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>Time left</p>
                      <p className="text-sm font-semibold">{timeLeft}</p>
                    </div>
                    <div>
                      <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>Market ID</p>
                      <p className="text-sm font-mono">{details.id}</p>
                    </div>
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-400">
                    High confidence
                  </h3>
                  <p className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                    {details.highConfidence.whyText}
                  </p>
                  <div className="text-sm">
                    <p>
                      Current: {details.highConfidence.currentProb.toFixed(3)} | Min:{' '}
                      {details.highConfidence.min.toFixed(2)} | Max:{' '}
                      {details.highConfidence.max.toFixed(2)}
                    </p>
                    {!isInRange && (
                      <p className={isDark ? 'text-amber-300' : 'text-amber-700'}>
                        Note: Current probability is outside the high-confidence range.
                      </p>
                    )}
                  </div>
                </section>
              </>
            )}

            {activeTab === 'about' && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-400">
                  About and rules
                </h3>
                <div className="space-y-3">
                  <div>
                    <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>Description</p>
                    <p className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                      {details.about.description ??
                        'No additional resolution details provided by Polymarket for this market.'}
                    </p>
                  </div>
                  <div>
                    <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>Resolution rules</p>
                    <p className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                      {details.about.resolution ??
                        'No additional resolution details provided by Polymarket for this market.'}
                    </p>
                  </div>
                  {details.url && (
                    <a
                      href={details.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`text-sm underline underline-offset-4 ${
                        isDark
                          ? 'text-slate-300 hover:text-slate-100'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      View on Polymarket
                    </a>
                  )}
                </div>
              </section>
            )}

            {activeTab === 'stats' && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-400">
                  Team stats
                </h3>
                {!details.sports && (
                  <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                    {details.sportsMeta?.reason === 'missing_api_key'
                      ? 'Set FOOTBALL_DATA_API_KEY in .env.local / Vercel env vars to enable soccer stats.'
                      : details.sportsMeta?.reason === 'matchup_parse_failed'
                        ? 'Could not parse team name(s) from this market title.'
                      : details.sportsMeta?.reason === 'fixture_not_found'
                        ? "Couldn't find the scheduled fixture for this team on that date."
                        : details.sportsMeta?.reason === 'team_not_found'
                          ? "Couldn't match this team to a supported fixture."
                        : details.sportsMeta?.reason === 'unsupported_competition'
                          ? "Soccer stats aren't available for this league/competition yet."
                        : details.sportsMeta?.reason === 'rate_limited'
                          ? 'Soccer stats are temporarily rate limited. Please try again shortly.'
                          : details.sportsMeta?.reason === 'upstream_error'
                            ? 'Soccer stats are unavailable due to an upstream error. Please try again.'
                            : 'Stats currently supported for soccer markets only.'}
                  </p>
                )}
                {details.sports && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        {details.sports.matchup.crestA && (
                          <img
                            src={details.sports.matchup.crestA}
                            alt={details.sports.matchup.teamA}
                            className="h-8 w-8"
                          />
                        )}
                        <span className="font-semibold">{details.sports.matchup.teamA}</span>
                      </div>
                      <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>vs</span>
                      <div className="flex items-center gap-2">
                        {details.sports.matchup.crestB && (
                          <img
                            src={details.sports.matchup.crestB}
                            alt={details.sports.matchup.teamB}
                            className="h-8 w-8"
                          />
                        )}
                        <span className="font-semibold">{details.sports.matchup.teamB}</span>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <MatchList
                        title={`${details.sports.matchup.teamA} last 5 matches`}
                        matches={details.sports.recentA}
                        teamName={details.sports.matchup.teamA}
                      />
                      <MatchList
                        title={`${details.sports.matchup.teamB} last 5 matches`}
                        matches={details.sports.recentB}
                        teamName={details.sports.matchup.teamB}
                      />
                    </div>
                    {details.sports.headToHead.length > 0 && (
                      <MatchList title="Head to head" matches={details.sports.headToHead} />
                    )}
                  </div>
                )}
              </section>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
