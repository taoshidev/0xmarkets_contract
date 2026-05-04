import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ReaderPricingUtils",
  libraryNames: [
    "MarketStoreUtils",
    "PositionStoreUtils",
    "PositionUtils",
    "PositionExecutionPriceUtils",
    "SwapPricingUtils",
  ],
});

export default func;
