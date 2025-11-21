import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ReaderPositionUtils",
  libraryNames: ["MarketUtils", "MarketStoreUtils", "PositionStoreUtils", "PositionUtils", "ReaderPricingUtils"],
});

export default func;
