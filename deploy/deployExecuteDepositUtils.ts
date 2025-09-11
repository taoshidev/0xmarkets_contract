import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ExecuteDepositUtils",
  libraryNames: [
    "GasUtils",
    "FeeUtils",
    "MarketUtils",
    "MarketStoreUtils",
    "MarketEventUtils",
    "DepositStoreUtils",
    "DepositEventUtils",
    // "SwapUtils", // MVP: swaps disabled
    // "SwapPricingUtils", // MVP: swaps disabled
    "PositionUtils",
  ],
});

export default func;
