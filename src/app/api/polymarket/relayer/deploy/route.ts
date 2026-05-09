import { NextResponse, type NextRequest } from 'next/server';
import { RelayClient, RelayerTxType } from '@polymarket/builder-relayer-client';
import { createWalletClient, custom } from 'viem';
import { polygon } from 'viem/chains';

export const runtime = 'nodejs';

const RELAYER_URL =
  process.env.POLYMARKET_RELAYER_URL ??
  process.env.NEXT_PUBLIC_POLY_RELAYER_URL ??
  'https://relayer-v2.polymarket.com/';
const CHAIN_ID = 137;
const DEPLOY_CACHE_TTL_MS = 60_000;
const deployCache = new Map<
  string,
  { proxyWalletAddress: string; deployed: boolean; checkedAt: number }
>();

type DeployRequest = {
  address?: string;
};

export async function POST(request: NextRequest) {
  const rawHeaders = Array.from(request.headers.keys());
  if (rawHeaders.some((key) => key.toLowerCase().startsWith('poly_'))) {
    return NextResponse.json(
      { ok: false, error: 'Unexpected auth headers.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let payload: DeployRequest;
  try {
    payload = (await request.json()) as DeployRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (!payload.address || !/^0x[0-9a-fA-F]{40}$/.test(payload.address)) {
    return NextResponse.json(
      { ok: false, error: 'Missing or invalid address.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const addressKey = payload.address.toLowerCase();
  const cached = deployCache.get(addressKey);
  if (cached && Date.now() - cached.checkedAt < DEPLOY_CACHE_TTL_MS) {
    return NextResponse.json(
      {
        ok: true,
        proxyWalletAddress: cached.proxyWalletAddress,
        deployed: cached.deployed,
        cached: true,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const walletClient = createWalletClient({
    chain: polygon,
    account: payload.address as `0x${string}`,
    transport: custom({
      request: async () => {
        throw new Error('Wallet signing is not available on the server.');
      },
    }),
  });

  const relayClient = new RelayClient(
    RELAYER_URL,
    CHAIN_ID,
    walletClient,
    undefined,
    RelayerTxType.SAFE,
  );

  try {
    const expectedSafe = await (
      relayClient as unknown as { getExpectedSafe: () => Promise<string> }
    ).getExpectedSafe();
    let deployed = await relayClient.getDeployed(expectedSafe);
    let proxyAddress = expectedSafe;

    deployCache.set(addressKey, {
      proxyWalletAddress: proxyAddress,
      deployed,
      checkedAt: Date.now(),
    });

    return NextResponse.json(
      { ok: true, proxyWalletAddress: proxyAddress, deployed },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Relayer error.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
