import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "DecreasePositionCollateralUtils",
  libraryNames: [
    "BaseOrderUtils",
    "FeeUtils",
    "MarketCollateralUtils",
    "MarketEventUtils",
    "PositionUtils",
    "PositionPricingUtils",
    "PositionEventUtils",
    "OrderEventUtils",
    "DecreasePositionSwapUtils",
  ],
});

export default func;
