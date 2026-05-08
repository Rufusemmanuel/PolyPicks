import 'server-only';

import { ClobClient, Chain } from '@polymarket/clob-client-v2';
import {
  getPolymarketBuilderCode,
  getPolymarketServerCreds,
} from './polymarketRuntimeConfig';

const CLOB_HOST =
  process.env.POLYMARKET_CLOB_URL ?? 'https://clob.polymarket.com';

export const getBuilderClient = () =>
  new ClobClient({
    host: CLOB_HOST,
    chain: Chain.POLYGON,
    creds: getPolymarketServerCreds(),
    builderConfig: { builderCode: getPolymarketBuilderCode() },
  });
