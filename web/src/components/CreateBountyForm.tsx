"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { parseEther, parseEventLogs } from "viem";
import { contractAddress, isContractConfigured } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import privacyBountyAbi from "@/abi/PrivacyBountyJudge";
import { useWriteTx } from "@/hooks/useWriteTx";
import {
  Card, CardHeader, CardBody, Field, Input, Button, TxStatus, Notice,
} from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

function toDatetimeLocal(offsetMs: number): string {
  const d = new Date(Date.now() + offsetMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreateBountyForm({ onCreated }: { onCreated?: (bountyId: bigint) => void }) {
  const { isConnected } = useAccount();
  const [bountyId, setBountyId] = useState("");
  const [title, setTitle] = useState("");
  const [commitDeadline, setCommitDeadline] = useState(toDatetimeLocal(24 * 60 * 60 * 1000));
  const [revealDeadline, setRevealDeadline] = useState(toDatetimeLocal(48 * 60 * 60 * 1000));
  const [reward, setReward] = useState("");
  const [createdId, setCreatedId] = useState<bigint | null>(null);

  const tx = useWriteTx((receipt) => {
    try {
      const logs = parseEventLogs({
        abi: privacyBountyAbi,
        eventName: "BountyCreated",
        logs: receipt.logs,
      });
      const id = logs[0]?.args?.bountyId;
      if (id !== undefined) {
        setCreatedId(id);
        onCreated?.(id);
      }
    } catch { /* not fatal */ }
  });

  const validation = useMemo(() => {
    if (!bountyId.trim() || isNaN(Number(bountyId))) return "Bounty ID must be a number.";
    if (!title.trim()) return "Title is required.";
    if (!commitDeadline) return "Pick a commit deadline.";
    if (!revealDeadline) return "Pick a reveal deadline.";
    const cTs = new Date(commitDeadline).getTime();
    const rTs = new Date(revealDeadline).getTime();
    if (!Number.isFinite(cTs)) return "Invalid commit deadline.";
    if (!Number.isFinite(rTs)) return "Invalid reveal deadline.";
    if (rTs <= cTs) return "Reveal deadline must be after commit deadline.";
    if (reward !== "") {
      try { parseEther(reward); } catch { return "Reward must be a valid number."; }
    }
    return null;
  }, [bountyId, title, commitDeadline, revealDeadline, reward]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validation || !contractAddress) return;
    const cTs = new Date(commitDeadline).getTime();
    const rTs = new Date(revealDeadline).getTime();
    if (cTs <= Date.now()) { window.alert("Commit deadline must be in the future."); return; }
    if (rTs <= cTs) { window.alert("Reveal deadline must be after commit deadline."); return; }
    const value = reward.trim() === "" ? 0n : parseEther(reward.trim());
    setCreatedId(null);
    try {
      await tx.run({
        address: contractAddress,
        abi: privacyBountyAbi,
        functionName: "createBounty",
        args: [BigInt(bountyId), title.trim(), BigInt(Math.floor(cTs / 1000)), BigInt(Math.floor(rTs / 1000))],
        gas: 500000n,
        value,
        chainId: ritualChain.id,
      });
    } catch { /* surfaced via tx.state */ }
  }

  return (
    <Card>
      <CardHeader title="Create a bounty" subtitle="Fund a reward with commit-reveal privacy." />
      <CardBody>
        {!isContractConfigured && (
          <Notice tone="amber">
            Set <code className="font-mono">NEXT_PUBLIC_CONTRACT_ADDRESS</code> in <code className="font-mono">.env.local</code>.
          </Notice>
        )}
        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Bounty ID" hint="Unique numeric identifier.">
              <Input value={bountyId} onChange={(e) => setBountyId(e.target.value)} placeholder="1" type="number" min="1" />
            </Field>
            <Field label="Reward (RITUAL)" hint="Locked in the contract on create.">
              <Input type="number" min="0" step="any" value={reward} onChange={(e) => setReward(e.target.value)} placeholder="1.0" />
            </Field>
          </div>
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Best ZK proof explanation" maxLength={200} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Commit Deadline" hint="Last moment to submit a commitment.">
              <Input type="datetime-local" value={commitDeadline} onChange={(e) => setCommitDeadline(e.target.value)} />
            </Field>
            <Field label="Reveal Deadline" hint="Last moment to reveal answer + salt.">
              <Input type="datetime-local" value={revealDeadline} onChange={(e) => setRevealDeadline(e.target.value)} />
            </Field>
          </div>
          {validation && (title || bountyId || reward) ? (
            <p className="text-xs text-amber-300">{validation}</p>
          ) : null}
          <Button type="submit" disabled={!isConnected || !isContractConfigured || !!validation || tx.isBusy} className="w-full">
            {tx.isBusy ? "Creating…" : "Create bounty"}
          </Button>
          {!isConnected && <p className="text-xs text-zinc-500">Connect your wallet to create a bounty.</p>}
          <TxStatus state={tx.state} error={tx.error} hash={tx.hash} explorerBase={explorerBase} />
          {createdId !== null && (
            <Notice tone="green">
              Bounty <span className="font-mono font-semibold">#{createdId.toString()}</span> created. Commit phase open.
            </Notice>
          )}
        </form>
      </CardBody>
    </Card>
  );
}
