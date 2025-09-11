import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "DecreaseOrderUtils",
  libraryNames: [
    // "SwapUtils", // MVP: swaps disabled
    "PositionStoreUtils",
    "DecreasePositionUtils",
    "OrderStoreUtils",
  ],
});

export default func;
