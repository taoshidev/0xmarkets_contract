import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "DecreasePositionUtils",
  libraryNames: [
    "MarketCollateralUtils",
    "MarketUtils",
    "MarketEventUtils",
    "PositionUtils",
    "PositionStoreUtils",
    "PositionEventUtils",
    "OrderEventUtils",
    "PositionPricingUtils",
    "ReferralEventUtils",
    "DecreasePositionCollateralUtils",
    "DecreasePositionSwapUtils",
  ],
});

export default func;
