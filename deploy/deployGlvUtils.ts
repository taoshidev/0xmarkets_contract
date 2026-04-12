import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GlvUtils",
  libraryNames: ["MarketUtils", "MarketStoreUtils", "GlvStoreUtils"],
});

func.skip = async ({ network }: any) => network.name === "localhost";

export default func;
