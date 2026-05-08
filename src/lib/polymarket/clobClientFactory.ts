import {
  ClobClient,
  Chain,
  type ApiKeyCreds,
  type BuilderConfig,
  type SignatureTypeV2,
} from '@polymarket/clob-client-v2';
import type { ViemSigner } from '@/lib/wallet/viemSigner';

type UserApiCreds = {
  apiKey: string;
  secret: string;
  passphrase: string;
};

type ClobClientFactoryArgs = {
  signer?: ViemSigner | null;
  userApiCreds?: UserApiCreds | null;
  signatureType?: SignatureTypeV2;
  proxyWalletAddress?: string | null;
  chainId?: Chain;
  host?: string;
  builderConfig?: BuilderConfig;
};

export const createClobClient = ({
  signer,
  userApiCreds,
  signatureType,
  proxyWalletAddress,
  chainId = Chain.POLYGON,
  host = 'https://clob.polymarket.com',
  builderConfig,
}: ClobClientFactoryArgs) => {
  const creds: ApiKeyCreds | undefined = userApiCreds
    ? {
        key: userApiCreds.apiKey,
        secret: userApiCreds.secret,
        passphrase: userApiCreds.passphrase,
      }
    : undefined;

  return new ClobClient({
    host,
    chain: chainId,
    signer: signer ? (signer as unknown as NonNullable<ConstructorParameters<typeof ClobClient>[0]['signer']>) : undefined,
    creds,
    signatureType,
    funderAddress: proxyWalletAddress ?? undefined,
    builderConfig,
    retryOnError: true,
  });
};
