import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ReaderDepositUtils",
  libraryNames: [
    "MarketUtils",
    "MarketStoreUtils",
    "PositionStoreUtils",
    "PositionUtils",
    // "SwapPricingUtils", // MVP: swaps disabled
  ],
});

export default func;
