import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ExecuteOrderUtils",
  libraryNames: [
    "MarketStoreUtils",
    "MarketUtils",
    "OrderStoreUtils",
    "OrderEventUtils",
    "IncreaseOrderUtils",
    "DecreaseOrderUtils",
    // "SwapOrderUtils", // MVP: swaps disabled
    "GasUtils",
    "PositionUtils",
  ],
});

export default func;
