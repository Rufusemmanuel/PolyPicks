const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

export const assertBuilderCodeReady = (builderCode: unknown): string => {
  if (typeof builderCode !== 'string' || !BYTES32_RE.test(builderCode)) {
    throw new Error('Polymarket builder code is required before order signing.');
  }
  return builderCode;
};

export const assertSignedOrderBuilder = (
  orderBuilder: unknown,
  expectedBuilderCode: string,
) => {
  if (typeof orderBuilder !== 'string' || !BYTES32_RE.test(orderBuilder)) {
    throw new Error('Signed order is missing the Polymarket builder field.');
  }
  if (orderBuilder.toLowerCase() !== expectedBuilderCode.toLowerCase()) {
    throw new Error('Signed order builder field does not match configured builder code.');
  }
};
