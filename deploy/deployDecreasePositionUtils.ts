import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "DecreasePositionUtils",
  libraryNames: [
    "DecreasePositionCollateralUtils",
    "DecreasePositionSwapUtils",
    "MarketEventUtils",
    "MarketUtils",
    "OrderEventUtils",
    "PositionEventUtils",
    "PositionStoreUtils",
    "PositionUtils",
    "ReferralEventUtils",
  ],
});

export default func;
