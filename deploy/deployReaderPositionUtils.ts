import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ReaderPositionUtils",
  libraryNames: [
    "MarketUtils",
    "MarketStoreUtils",
    "PositionStoreUtils",
    "PositionUtils",
    "PositionPricingUtils",
    "ReaderPricingUtils",
  ],
});

export default func;
