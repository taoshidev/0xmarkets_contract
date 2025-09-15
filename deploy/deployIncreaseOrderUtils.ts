import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "IncreaseOrderUtils",
  libraryNames: [
    // "SwapUtils", // MVP: swaps disabled
    "PositionStoreUtils",
    "IncreasePositionUtils",
    "OrderStoreUtils",
    "MarketEventUtils",
  ],
});

export default func;
