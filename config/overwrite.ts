export function getExistingContractAddresses(network) {
  const config: { [network: string]: any } = {
    base: {},
    baseSepolia: {},
    localhost: {},
    hardhat: {},
  };

  return config[network.name === "baseSepoliaFork" ? "baseSepolia" : network.name];
}
