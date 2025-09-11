import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "DecreasePositionCollateralUtils",
  libraryNames: [
    "BaseOrderUtils",
    "FeeUtils",
    "MarketEventUtils",
    "PositionUtils",
    "PositionPricingUtils",
    "PositionEventUtils",
    "OrderEventUtils",
    // "DecreasePositionSwapUtils", // MVP: swaps disabled
  ],
});

export default func;
