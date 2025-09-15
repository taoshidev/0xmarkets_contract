import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ExecuteWithdrawalUtils",
  libraryNames: [
    "GasUtils",
    "FeeUtils",
    "MarketUtils",
    "MarketStoreUtils",
    "MarketEventUtils",
    "WithdrawalStoreUtils",
    "WithdrawalEventUtils",
    // "SwapUtils", // MVP: swaps disabled
    // "SwapPricingUtils", // MVP: swaps disabled
    "PositionUtils",
  ],
});

export default func;
