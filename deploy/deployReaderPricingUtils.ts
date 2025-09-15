import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ReaderPricingUtils",
  libraryNames: [
    "MarketStoreUtils",
    "PositionStoreUtils",
    "PositionUtils",
    // "SwapPricingUtils", // MVP: swaps disabled
  ],
});

export default func;
