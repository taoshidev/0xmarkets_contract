import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "OrderUtils",
  libraryNames: [
    "Printer",
    "MarketStoreUtils",
    "MarketUtils",
    "OrderStoreUtils",
    "OrderEventUtils",
    "IncreaseOrderUtils",
    "DecreaseOrderUtils",
    // "SwapOrderUtils", // MVP: swaps disabled
    "GasUtils",
  ],
});

export default func;
