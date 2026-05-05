import * as keys from "./keys";

export function getClaimableFeeAmount(dataStore, market, token, receiver?: string) {
  const key = receiver
    ? keys.claimableFeeAmountKey(market, token, receiver)
    : keys.claimableFeeAmountKey(market, token);
  return dataStore.getUint(key);
}
