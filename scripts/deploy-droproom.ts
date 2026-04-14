import { network } from "hardhat";
import { getAddress, isAddress } from "viem";

const platformWallet = process.env.NEXT_PUBLIC_PLATFORM_WALLET;
const contractURI = process.env.DROPROOM_CONTRACT_URI ?? "";

if (!platformWallet || !isAddress(platformWallet)) {
  throw new Error("NEXT_PUBLIC_PLATFORM_WALLET must be a valid address before deploying.");
}

const { viem } = await network.connect();
const [deployer] = await viem.getWalletClients();

console.log("Deploying DroproomDrops");
console.log("Deployer:", deployer.account.address);
console.log("Platform wallet:", getAddress(platformWallet));

const contract = await viem.deployContract("DroproomDrops", [getAddress(platformWallet), contractURI], {
  client: { wallet: deployer },
  confirmations: Number(process.env.DEPLOY_CONFIRMATIONS ?? 2)
});

console.log("DroproomDrops deployed:", contract.address);
console.log("Next Vercel env:");
console.log(`NEXT_PUBLIC_DROP_CONTRACT_ADDRESS=${contract.address}`);
