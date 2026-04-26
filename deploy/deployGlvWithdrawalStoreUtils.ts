import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GlvWithdrawalStoreUtils",
});

func.skip = async ({ network }: any) => network.name === "localhost";

export default func;
