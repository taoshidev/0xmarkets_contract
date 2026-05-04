import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "IncreasePositionUtils",
  libraryNames: [
    "FeeUtils",
    "MarketEventUtils",
    "MarketUtils",
    "PositionEventUtils",
    "PositionPricingUtils",
    "PositionStoreUtils",
    "PositionUtils",
    "ReferralEventUtils",
  ],
});

export default func;
