import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "IncreasePositionUtils",
  libraryNames: [
    "FeeUtils",
    "MarketCollateralUtils",
    "MarketUtils",
    "MarketEventUtils",
    "PositionUtils",
    "PositionExecutionPriceUtils",
    "PositionStoreUtils",
    "PositionEventUtils",
    "ReferralEventUtils",
  ],
});

export default func;
