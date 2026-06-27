import { useReadContract } from "wagmi";
import { contractAddress } from "@/config/contract";
import privacyBountyAbi from "@/abi/PrivacyBountyJudge";

export function useBounty(bountyId: bigint) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: contractAddress,
    abi: privacyBountyAbi,
    functionName: "getBountyInfo",
    args: [bountyId],
    query: { enabled: !!contractAddress },
  });

  const info = data as readonly [string, string, bigint, bigint, bigint, boolean, string, bigint] | undefined;

  return {
    creator:         info?.[0] as `0x${string}` | undefined,
    title:           info?.[1],
    commitDeadline:  info?.[2],
    revealDeadline:  info?.[3],
    prize:           info?.[4],
    finalized:       info?.[5],
    winner:          info?.[6] as `0x${string}` | undefined,
    submissionCount: info?.[7],
    isLoading,
    error,
    refetch,
  };
}
