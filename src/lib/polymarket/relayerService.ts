import { RelayClient, RelayerTxType } from '@polymarket/builder-relayer-client';
import type { WalletClient } from 'viem';

type BuilderConfig = ConstructorParameters<typeof RelayClient>[3];

type RelayerService = {
  relayClient: RelayClient;
  proxyAddress: string;
  deployed: boolean;
  ensureDeployed: () => Promise<string>;
};

type CreateRelayerServiceArgs = {
  relayerUrl: string;
  chainId: number;
  walletClient: WalletClient;
  builderConfig?: BuilderConfig;
};

type RelayerDeployResponse = {
  ok: boolean;
  proxyWalletAddress?: string;
  deployed?: boolean;
  error?: string;
};

const relayerProxyCache = new Map<
  string,
  {
    value: { proxyWalletAddress: string; deployed: boolean } | null;
    timestamp: number;
    inFlight: Promise<{ proxyWalletAddress: string; deployed: boolean }> | null;
  }
>();

export const createRelayerService = async ({
  relayerUrl,
  chainId,
  walletClient,
  builderConfig,
}: CreateRelayerServiceArgs): Promise<RelayerService> => {
  const relayClient = new RelayClient(
    relayerUrl,
    chainId,
    walletClient,
    builderConfig,
    RelayerTxType.SAFE,
  );
  const expectedSafe = await (
    relayClient as unknown as { getExpectedSafe: () => Promise<string> }
  ).getExpectedSafe();
  let deployed = await relayClient.getDeployed(expectedSafe);
  const ensureDeployed = async () => {
    if (deployed) return expectedSafe;
    const deployResponse = await relayClient.deploy();
    const result = await deployResponse.wait();
    const proxy = result?.proxyAddress ?? expectedSafe;
    deployed = await relayClient.getDeployed(proxy);
    return proxy;
  };

  return {
    relayClient,
    proxyAddress: expectedSafe,
    deployed,
    ensureDeployed,
  };
};

export const ensureRelayerProxy = async (address: string) => {
  const key = address.toLowerCase();
  const now = Date.now();
  const cached = relayerProxyCache.get(key);
  if (cached?.value && now - cached.timestamp < 60_000) {
    return cached.value;
  }
  if (cached?.inFlight) {
    return cached.inFlight;
  }
  const inFlight = (async () => {
    const res = await fetch('/api/polymarket/relayer/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    const data = (await res.json()) as RelayerDeployResponse;
    if (!res.ok || !data.ok || !data.proxyWalletAddress) {
      throw new Error(data.error ?? 'Unable to deploy relayer proxy.');
    }
    const value = {
      proxyWalletAddress: data.proxyWalletAddress,
      deployed: Boolean(data.deployed),
    };
    relayerProxyCache.set(key, { value, timestamp: Date.now(), inFlight: null });
    return value;
  })();
  relayerProxyCache.set(key, { value: null, timestamp: now, inFlight });
  return inFlight;
};
