type TeamSearchResponse = {
  teams: {
    id: number;
    name: string;
    shortName?: string;
    tla?: string;
    crest?: string;
    runningCompetitions?: { id: number; name: string }[];
  }[];
};

type TeamDetailsResponse = {
  id: number;
  name: string;
  shortName?: string;
  tla?: string;
  crest?: string;
  runningCompetitions?: { id: number; name: string }[];
};

type MatchResponse = {
  matches: {
    id: number;
    utcDate: string;
    competition?: { id?: number; name?: string; code?: string };
    score?: { fullTime?: { home?: number | null; away?: number | null } };
    homeTeam: { id: number; name: string; shortName?: string };
    awayTeam: { id: number; name: string; shortName?: string };
  }[];
};

type CompetitionMatchesResponse = {
  matches: MatchResponse['matches'];
};

type FixtureResolution =
  | { fixture: FixtureMatch; reason?: undefined }
  | { fixture: null; reason: 'fixture_not_found' | 'team_not_found' };

export type FootballTeam = {
  id: number;
  name: string;
  shortName?: string;
  tla?: string;
  crest?: string;
  runningCompetitions?: { id: number; name: string }[];
};

export type FootballMatch = {
  utcDate: string;
  competition?: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
};


const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const CACHE_REVALIDATE_SECONDS = 6 * 60 * 60;
let rateLimitHit = false;

type QueryParams = Record<string, string | number | undefined>;

const buildQuery = (params: QueryParams): string => {
  const entries = Object.entries(params).filter(([, value]) => value != null);
  if (!entries.length) return '';
  const search = new URLSearchParams();
  for (const [key, value] of entries) {
    search.set(key, String(value));
  }
  return `?${search.toString()}`;
};

const fetchFootballData = async <T>(
  path: string,
  params: QueryParams = {},
): Promise<T | null> => {
  if (!API_KEY) return null;
  try {
    const url = `${FOOTBALL_DATA_BASE}${path}${buildQuery(params)}`;
    const res = await fetch(url, {
      headers: {
        'X-Auth-Token': API_KEY,
      },
      next: { revalidate: CACHE_REVALIDATE_SECONDS },
    });
    if (res.status === 429) {
      rateLimitHit = true;
      return null;
    }
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
};

const normalizeName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const hasSlugToken = (slug: string, token: string) =>
  new RegExp(`(^|-)${token}(-|$)`, 'i').test(slug);

export const normalizeTeamName = (name: string) => {
  const aliases: Record<string, string> = {
    wolves: 'wolverhampton wanderers',
    brighton: 'brighton and hove albion',
    'ss lazio': 'lazio',
    'acf fiorentina': 'fiorentina',
  };
  const abbreviations: Record<string, string> = {
    utd: 'united',
    nottm: 'nottingham',
    bor: 'borussia',
    dep: 'deportivo',
    ath: 'athletic',
  };
  const base = normalizeName(name).replace(/&/g, ' and ');
  const normalizedBase = normalizeName(base);
  const alias = aliases[normalizedBase];
  const tokens = (alias ?? normalizedBase)
    .split(' ')
    .map((token) => abbreviations[token] ?? token)
    .filter(
      (token) =>
        token &&
        ![
          'fc',
          'sc',
          'cf',
          'afc',
          'the',
          'club',
          'ud',
          'cd',
          'ss',
          'ac',
          'as',
          'calcio',
        ].includes(token),
    );
  return tokens.join(' ').trim();
};

export const isFootballDataConfigured = () => Boolean(API_KEY);

export const consumeRateLimitSignal = () => {
  const hit = rateLimitHit;
  rateLimitHit = false;
  return hit;
};

const scoreTeamMatch = (team: TeamSearchResponse['teams'][number], query: string): number => {
  const normalizedQuery = normalizeTeamName(query);
  const normalizedName = normalizeTeamName(team.name);
  if (normalizedName === normalizedQuery) return 100;
  if (team.shortName && normalizeTeamName(team.shortName) === normalizedQuery) return 95;
  if (team.tla && team.tla.toLowerCase() === normalizedQuery.replace(/ /g, '')) return 90;

  const queryTokens = new Set(normalizedQuery.split(' ').filter(Boolean));
  const nameTokens = new Set(normalizedName.split(' ').filter(Boolean));
  if (!queryTokens.size || !nameTokens.size) return 0;
  let overlap = 0;
  for (const token of queryTokens) {
    if (nameTokens.has(token)) overlap += 1;
  }
  return Math.round((overlap / Math.max(queryTokens.size, nameTokens.size)) * 60);
};

const bestTeamMatch = (
  teams: TeamSearchResponse['teams'],
  query: string,
  threshold = 60,
) => {
  let best: TeamSearchResponse['teams'][number] | null = null;
  let bestScore = 0;
  for (const team of teams) {
    const score = scoreTeamMatch(team, query);
    if (score > bestScore) {
      best = team;
      bestScore = score;
    }
  }
  if (!best || bestScore < threshold) return null;
  return best;
};

export const parseMatchupFromTitle = (
  title: string,
): { teamA: string; teamB: string } | null => {
  if (!title) return null;
  const drawMatch = title.match(
    /^Will\s+(.+?)\s+(?:vs\.?|v|@)\s+(.+?)\s+end\s+in\s+a\s+draw\??$/i,
  );
  if (drawMatch) {
    const teamA = drawMatch[1]?.trim().replace(/[?)]$/, '');
    const teamB = drawMatch[2]?.trim().replace(/[?)]$/, '');
    if (teamA && teamB && teamA.length >= 2 && teamB.length >= 2) {
      return { teamA, teamB };
    }
  }
  const cleaned = title
    .split(':')[0]
    ?.split(' - ')[0]
    ?.split('(')[0]
    ?.replace(/^Will\s+/i, '')
    ?.replace(/\s+end\s+in\s+a\s+draw\??$/i, '')
    ?.replace(/\s+end\s+in\s+a\s+tie\??$/i, '')
    ?.replace(/\bO\/U\b.*$/i, '')
    ?.replace(/\bOver\/Under\b.*$/i, '')
    ?.replace(/\bTotals?\b.*$/i, '')
    ?.replace(/\bSpread\b.*$/i, '')
    ?.replace(/\bHandicap\b.*$/i, '')
    ?.trim();
  if (!cleaned) return null;

  const match = cleaned.match(/(.+?)\s+(?:vs\.?|v|@)\s+(.+)/i);
  if (!match) return null;
  const teamA = match[1]?.trim().replace(/[?)]$/, '');
  const teamB = match[2]?.trim().replace(/[?)]$/, '');
  if (!teamA || !teamB) return null;
  if (teamA.length < 2 || teamB.length < 2) return null;
  return { teamA, teamB };
};

export const parseSingleTeamFromTitle = (
  title: string,
): { team: string; date?: string | null } | null => {
  if (!title || !/^will\s/i.test(title)) return null;
  const match = title.match(
    /^Will\s+(.+?)\s+win(?:\s+on\s+(\d{4}-\d{2}-\d{2}))?/i,
  );
  if (!match) return null;
  const team = match[1]
    ?.trim()
    .replace(/[?)]$/, '')
    .replace(/\s+\b(?:total|spread|over\/under|o\/u)\b.*$/i, '')
    .trim();
  const date = match[2]?.trim();
  if (!team || team.length < 2) return null;
  return { team, date: date || null };
};

export const parseSingleTeamWinFromTitle = (
  title: string,
): { team: string; date?: string | null } | null => {
  if (!title || !/^will\s/i.test(title)) return null;
  const withDate = title.match(
    /^Will\s+(.+?)\s+win\s+on\s+(\d{4}-\d{2}-\d{2})\??/i,
  );
  const withoutDate = title.match(/^Will\s+(.+?)\s+win\??/i);
  const teamRaw = (withDate?.[1] ?? withoutDate?.[1])?.trim();
  if (!teamRaw || teamRaw.length < 2) return null;
  const team = teamRaw
    .replace(/[?)]$/, '')
    .replace(/\s+\b(?:total|spread|over\/under|o\/u)\b.*$/i, '')
    .trim();
  const date = withDate?.[2]?.trim() ?? null;
  return { team, date };
};

export const parseTeamFromSpreadTitle = (
  title: string,
): { team: string } | null => {
  if (!title) return null;
  const match = title.match(
    /^(?:Spread|Handicap)\s*:\s*(.+?)\s*\(([-+]?[\d.]+)\)\s*$/i,
  );
  if (!match) return null;
  const teamRaw = match[1]?.trim();
  if (!teamRaw) return null;
  const team = teamRaw
    .replace(/\([^)]*\)\s*$/, '')
    .replace(/[?)]$/, '')
    .replace(/\s+\b(?:total|spread|handicap|over\/under|o\/u)\b.*$/i, '')
    .trim();
  if (!team || team.length < 2) return null;
  return { team };
};
const pickBestTeam = (teams: TeamSearchResponse['teams'], query: string) =>
  bestTeamMatch(teams, query);

export const resolveTeamIdFromSearch = async (
  name: string,
): Promise<FootballTeam | null> => searchTeamByName(name);

export const searchTeamByName = async (name: string): Promise<FootballTeam | null> => {
  const response = await fetchFootballData<TeamSearchResponse>('/teams', { name });
  if (!response?.teams?.length) return null;
  const match = pickBestTeam(response.teams, name);
  if (!match) return null;
  return {
    id: match.id,
    name: match.name,
    shortName: match.shortName,
    tla: match.tla,
    crest: match.crest,
    runningCompetitions: match.runningCompetitions,
  };
};

export const getTeamDetails = async (teamId: number): Promise<FootballTeam | null> => {
  const response = await fetchFootballData<TeamDetailsResponse>(`/teams/${teamId}`);
  if (!response) return null;
  return {
    id: response.id,
    name: response.name,
    shortName: response.shortName,
    tla: response.tla,
    crest: response.crest,
    runningCompetitions: response.runningCompetitions,
  };
};

const toFootballMatch = (match: MatchResponse['matches'][number]): FootballMatch => ({
  utcDate: match.utcDate,
  competition: match.competition?.name ?? null,
  homeTeam: match.homeTeam.name,
  awayTeam: match.awayTeam.name,
  homeScore: match.score?.fullTime?.home ?? null,
  awayScore: match.score?.fullTime?.away ?? null,
});

export const getRecentMatches = async (
  teamId: number,
  limit = 5,
): Promise<FootballMatch[]> => {
  const response = await fetchFootballData<MatchResponse>(`/teams/${teamId}/matches`, {
    status: 'FINISHED',
    limit,
  });
  if (!response?.matches) return [];
  return response.matches.map(toFootballMatch);
};

export const getHeadToHead = async (
  matchId: number,
  limit = 5,
): Promise<FootballMatch[]> => {
  const response = await fetchFootballData<MatchResponse>(`/matches/${matchId}/head2head`);
  if (!response?.matches) return [];
  return response.matches.slice(0, limit).map(toFootballMatch);
};


const tokenMatches = (queryToken: string, candidateToken: string) => {
  if (queryToken === candidateToken) return true;
  if (queryToken.length < 3 || candidateToken.length < 3) return false;
  return queryToken.startsWith(candidateToken) || candidateToken.startsWith(queryToken);
};

const scoreNameMatch = (query: string, candidate: string): number => {
  const normalizedQuery = normalizeTeamName(query);
  const normalizedCandidate = normalizeTeamName(candidate);
  if (!normalizedQuery || !normalizedCandidate) return 0;
  if (normalizedQuery === normalizedCandidate) return 100;

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const candidateTokens = normalizedCandidate.split(' ').filter(Boolean);
  if (!queryTokens.length || !candidateTokens.length) return 0;

  if (queryTokens.length === 1 && candidateTokens.includes(queryTokens[0])) {
    return 90;
  }

  let overlap = 0;
  for (const queryToken of queryTokens) {
    if (candidateTokens.some((candidateToken) => tokenMatches(queryToken, candidateToken))) {
      overlap += 1;
    }
  }
  if (!overlap) return 0;
  const ratio = overlap / Math.max(queryTokens.length, candidateTokens.length);
  return Math.round(ratio * 70);
};

export type FixtureMatch = {
  matchId: number;
  utcDate: string;
  competition?: string | null;
  competitionCode?: string | null;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
};

const fetchMatchesByDate = async (
  matchDate: string,
  competitionCode?: string | null,
): Promise<CompetitionMatchesResponse | null> => {
  const base = new Date(`${matchDate}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  const dateFrom = new Date(base.getTime() - dayMs).toISOString().slice(0, 10);
  const dateTo = new Date(base.getTime() + dayMs).toISOString().slice(0, 10);
  if (competitionCode) {
    return fetchFootballData<CompetitionMatchesResponse>(
      `/competitions/${competitionCode}/matches`,
      { dateFrom, dateTo },
    );
  }
  return fetchFootballData<CompetitionMatchesResponse>(`/matches`, {
    dateFrom,
    dateTo,
  });
};

export const findFixtureMatch = async (
  matchDate: string,
  teamA: string,
  teamB: string,
  competitionCode?: string | null,
): Promise<FixtureMatch | null> => {
  const response = await fetchMatchesByDate(matchDate, competitionCode);
  if (!response?.matches?.length) return null;

  let best: MatchResponse['matches'][number] | null = null;
  let bestScore = 0;

  for (const match of response.matches) {
    const homeScore = Math.max(
      scoreNameMatch(teamA, match.homeTeam.name),
      scoreNameMatch(teamA, match.homeTeam.shortName ?? ''),
    );
    const awayScore = Math.max(
      scoreNameMatch(teamB, match.awayTeam.name),
      scoreNameMatch(teamB, match.awayTeam.shortName ?? ''),
    );
    const swapScore =
      Math.max(
        scoreNameMatch(teamA, match.awayTeam.name),
        scoreNameMatch(teamA, match.awayTeam.shortName ?? ''),
      ) +
      Math.max(
        scoreNameMatch(teamB, match.homeTeam.name),
        scoreNameMatch(teamB, match.homeTeam.shortName ?? ''),
      );
    const score = Math.max(homeScore + awayScore, swapScore);
    if (score > bestScore) {
      bestScore = score;
      best = match;
    }
  }

  if (!best || bestScore < 120) return null;

  return {
    matchId: best.id,
    utcDate: best.utcDate,
    competition: best.competition?.name ?? null,
    competitionCode: best.competition?.code ?? competitionCode ?? null,
    homeTeamId: best.homeTeam.id,
    awayTeamId: best.awayTeam.id,
    homeTeamName: best.homeTeam.name,
    awayTeamName: best.awayTeam.name,
  };
};

export const findFixtureForSingleTeam = async (
  matchDate: string,
  teamName: string,
  competitionCode?: string | null,
): Promise<FixtureMatch | null> => {
  const response = await fetchMatchesByDate(matchDate, competitionCode);
  if (!response?.matches?.length) return null;

  let best: MatchResponse['matches'][number] | null = null;
  let bestScore = 0;

  for (const match of response.matches) {
    const homeScore = Math.max(
      scoreNameMatch(teamName, match.homeTeam.name),
      scoreNameMatch(teamName, match.homeTeam.shortName ?? ''),
    );
    const awayScore = Math.max(
      scoreNameMatch(teamName, match.awayTeam.name),
      scoreNameMatch(teamName, match.awayTeam.shortName ?? ''),
    );
    const score = Math.max(homeScore, awayScore);
    if (score > bestScore) {
      bestScore = score;
      best = match;
    }
  }

  if (!best || bestScore < 80) return null;

  return {
    matchId: best.id,
    utcDate: best.utcDate,
    competition: best.competition?.name ?? null,
    competitionCode: best.competition?.code ?? competitionCode ?? null,
    homeTeamId: best.homeTeam.id,
    awayTeamId: best.awayTeam.id,
    homeTeamName: best.homeTeam.name,
    awayTeamName: best.awayTeam.name,
  };
};

export const findFixtureForSingleTeamWithReason = async (
  matchDate: string,
  teamName: string,
  competitionCode: string,
): Promise<FixtureResolution> => {
  const response = await fetchMatchesByDate(matchDate, competitionCode);
  if (!response?.matches?.length) return { fixture: null, reason: 'fixture_not_found' };

  let best: MatchResponse['matches'][number] | null = null;
  let bestScore = 0;

  for (const match of response.matches) {
    const homeScore = Math.max(
      scoreNameMatch(teamName, match.homeTeam.name),
      scoreNameMatch(teamName, match.homeTeam.shortName ?? ''),
    );
    const awayScore = Math.max(
      scoreNameMatch(teamName, match.awayTeam.name),
      scoreNameMatch(teamName, match.awayTeam.shortName ?? ''),
    );
    const score = Math.max(homeScore, awayScore);
    if (score > bestScore) {
      bestScore = score;
      best = match;
    }
  }

  if (!best || bestScore < 80) return { fixture: null, reason: 'team_not_found' };

  return {
    fixture: {
      matchId: best.id,
      utcDate: best.utcDate,
      competition: best.competition?.name ?? null,
      competitionCode: best.competition?.code ?? competitionCode ?? null,
      homeTeamId: best.homeTeam.id,
      awayTeamId: best.awayTeam.id,
      homeTeamName: best.homeTeam.name,
      awayTeamName: best.awayTeam.name,
    },
  };
};

const competitionTokenMap: Record<string, string> = {
  epl: 'PL',
  'premier-league': 'PL',
  ucl: 'CL',
  'champions-league': 'CL',
  'europa-league': 'EL',
  'conference-league': 'ECL',
  'la-liga': 'PD',
  sea: 'SA',
  sa: 'SA',
  'serie-a': 'SA',
  bundesliga: 'BL1',
  'ligue-1': 'FL1',
  eredivisie: 'DED',
  'primeira-liga': 'PPL',
  'liga-nos': 'PPL',
  championship: 'ELC',
  'fa-cup': 'FAC',
  'efl-cup': 'EFL',
  carabao: 'EFL',
  'copa-del-rey': 'CDR',
  'coppa-italia': 'CIT',
  'world-cup': 'WC',
};

const FOOTBALL_DATA_ALLOWLIST = new Set([
  'PL',
  'CL',
  'EL',
  'ECL',
  'PD',
  'SA',
  'BL1',
  'FL1',
  'DED',
  'PPL',
  'ELC',
  'FAC',
  'EFL',
  'CDR',
  'CIT',
  'WC',
]);

const hasTitleToken = (title: string, token: string) => {
  const normalized = title.toLowerCase();
  const regex = new RegExp(`\\b${token.replace(/-/g, '\\\\s+')}\\b`, 'i');
  return regex.test(normalized);
};

export const resolveCompetitionCandidates = (slug: string, title: string): string[] => {
  const lowerSlug = slug.toLowerCase();
  const candidates: string[] = [];
  for (const [token, code] of Object.entries(competitionTokenMap)) {
    if (hasSlugToken(lowerSlug, token)) candidates.push(code);
  }
  for (const [token, code] of Object.entries(competitionTokenMap)) {
    if (hasTitleToken(title, token)) candidates.push(code);
  }
  return Array.from(new Set(candidates)).filter((code) => FOOTBALL_DATA_ALLOWLIST.has(code));
};

export const resolveCompetitionCode = (slug: string) =>
  resolveCompetitionCandidates(slug, '')[0] ?? null;

export const isLikelyCountryTeam = (name: string) => {
  const normalized = normalizeName(name);
  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.length === 1 && tokens[0].length >= 4) return true;
  const clubTokens = [
    'fc',
    'sc',
    'cf',
    'afc',
    'united',
    'city',
    'ac',
    'as',
    'ss',
    'calcio',
    'club',
  ];
  return !clubTokens.some((token) => tokens.includes(token));
};

export const isSoccerMarket = (title: string, slug: string, tags?: string[]) => {
  const lowerSlug = slug.toLowerCase();
  const slugTokens = [
    'soccer',
    'football',
    'world-cup',
    'uefa',
    'fifa',
    'afcon',
  ];
  const slugHit = slugTokens.some((token) => hasSlugToken(lowerSlug, token));
  const candidates = resolveCompetitionCandidates(slug, title);
  return slugHit || candidates.length > 0;
};

export const isAmericanLeagueMarket = (title: string, slug: string) => {
  const lowerSlug = slug.toLowerCase();
  const slugTokens = ['nfl', 'nba', 'mlb', 'nhl'];
  if (slugTokens.some((token) => hasSlugToken(lowerSlug, token))) return true;
  return false;
};
