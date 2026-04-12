import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GlvDepositStoreUtils",
});

func.skip = async ({ network }: any) => network.name === "localhost";

export default func;
