import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "IncreasePositionUtils",
  libraryNames: [
    "FeeUtils",
    "MarketCollateralUtils",
    "MarketUtils",
    "MarketEventUtils",
    "PositionUtils",
    "PositionStoreUtils",
    "PositionEventUtils",
    "ReferralEventUtils",
  ],
});

export default func;
