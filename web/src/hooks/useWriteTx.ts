"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useSwitchChain, usePublicClient } from "wagmi";
import type { Abi, Address, TransactionReceipt } from "viem";
import { ritualChain } from "@/config/wagmi";

type WriteParams = {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  chainId?: number;
  gas?: bigint;
  gasPrice?: bigint;
};

export type TxState = "idle" | "wallet" | "pending" | "confirmed" | "failed";
export type WriteTx = ReturnType<typeof useWriteTx>;

function describeError(err: unknown): string {
  if (!err) return "Transaction failed.";
  const e = err as { shortMessage?: string; message?: string };
  const msg = e.shortMessage || e.message || String(err);
  if (/user rejected|denied|rejected the request/i.test(msg)) return "Request rejected in wallet.";
  return msg.split("\n")[0];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

export function useWriteTx(onConfirmed?: (receipt: TransactionReceipt) => void) {
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: ritualChain.id });
  const { data: hash, reset: resetWrite, isPending: isWalletPending, mutateAsync: writeContractAsync } = useWriteContract();
  const { data: receipt, isLoading: isConfirming, isSuccess: isConfirmed, isError: isReceiptError, error: receiptError } = useWaitForTransactionReceipt({ hash });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (isConfirmed && receipt && !notifiedRef.current) {
      notifiedRef.current = true;
      onConfirmed?.(receipt);
    }
  }, [isConfirmed, receipt, onConfirmed]);

  const error = submitError ?? (isReceiptError && receiptError ? describeError(receiptError) : null);
  const state: TxState = error ? "failed"
    : isConfirmed ? "confirmed"
    : isConfirming ? "pending"
    : submitting || isWalletPending ? "wallet"
    : "idle";

  const run = useCallback(async (params: WriteParams) => {
    setSubmitError(null);
    notifiedRef.current = false;
    setSubmitting(true);
    try {
      await switchChainAsync({ chainId: ritualChain.id });

      let gasPrice: bigint | undefined;
      try {
        const gp = await publicClient?.getGasPrice();
        if (gp) gasPrice = (gp * 120n) / 100n;
      } catch { /* ignore */ }

      const writeParams = {
        ...params,
        gas: params.gas ?? 300000n,
        ...(gasPrice ? { gasPrice } : {}),
      };

      return await (writeContractAsync as AnyFn)(writeParams);
    } catch (e) {
      setSubmitError(describeError(e));
      throw e;
    } finally {
      setSubmitting(false);
    }
  }, [writeContractAsync, switchChainAsync, publicClient]);

  const reset = useCallback(() => {
    resetWrite();
    setSubmitError(null);
    notifiedRef.current = false;
    setSubmitting(false);
  }, [resetWrite]);

  return { run, reset, state, hash, receipt, error, isBusy: state === "wallet" || state === "pending", isConfirmed };
}
