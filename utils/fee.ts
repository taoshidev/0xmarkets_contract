import * as keys from "./keys";

export function getClaimableFeeAmount(dataStore, market, token, receiver?: string) {
  const key = keys.claimableFeeAmountKey(market, token, receiver);
  return dataStore.getUint(key);
}
