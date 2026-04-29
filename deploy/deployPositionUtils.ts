import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "PositionUtils",
  libraryNames: ["MarketStoreUtils", "MarketUtils"],
});

export default func;
