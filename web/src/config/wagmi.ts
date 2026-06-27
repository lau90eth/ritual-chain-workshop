import { createConfig, http } from "wagmi";
import { defineChain } from "viem";
import { injected, metaMask, walletConnect } from "wagmi/connectors";
import { ritualChainId, ritualRpcUrl } from "@/config/contract";

export const ritualChain = defineChain({
  id: ritualChainId,
  name: "Ritual Chain",
  nativeCurrency: { name: "Ritual", symbol: "RITUAL", decimals: 18 },
  rpcUrls: {
    default: { http: [ritualRpcUrl] },
  },
  blockExplorers: {
    default: { name: "RitualScan", url: "https://explorer.ritualfoundation.org" },
  },
  fees: {
    baseFeeMultiplier: 1.2,
  },
});

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();

const connectors = [
  injected({ shimDisconnect: true }),
  ...(walletConnectProjectId ? [walletConnect({ projectId: walletConnectProjectId })] : []),
];

export const config = createConfig({
  chains: [ritualChain],
  connectors,
  ssr: true,
  transports: {
    [ritualChain.id]: http(ritualRpcUrl, {
      fetchOptions: { cache: "no-store" },
    }),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
