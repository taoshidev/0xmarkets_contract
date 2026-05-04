import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "DecreasePositionCollateralUtils",
  libraryNames: [
    "DecreasePositionSwapUtils",
    "FeeUtils",
    "MarketEventUtils",
    "OrderEventUtils",
    "PositionEventUtils",
    "PositionPricingUtils",
    "PositionUtils",
  ],
});

export default func;
