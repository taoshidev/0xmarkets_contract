import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "Reader",
  libraryNames: [
    "DepositStoreUtils",
    "MarketStoreUtils",
    "MarketUtils",
    "PositionStoreUtils",
    "PositionUtils",
    "ReaderDepositUtils",
    "ReaderPositionUtils",
    "ReaderPricingUtils",
    "ReaderUtils",
    "ReaderWithdrawalUtils",
    "ShiftStoreUtils",
    "WithdrawalStoreUtils",
    "InsuranceFundUtils",
  ],
});

export default func;
