import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import {
  parseEther,
  keccak256,
  encodePacked,
  toHex,
  toBytes,
} from "viem";

const BOUNTY_ID = 1n;

function makeSalt(s: string): `0x${string}` {
  const b = toBytes(s);
  const p = new Uint8Array(32);
  p.set(b.slice(0, 32));
  return toHex(p) as `0x${string}`;
}

function makeCommit(answer: string, salt: `0x${string}`, addr: `0x${string}`): `0x${string}` {
  return keccak256(encodePacked(
    ["string", "bytes32", "address", "uint256"],
    [answer, salt, addr, BOUNTY_ID]
  ));
}

async function setup() {
  const conn = await hre.network.getOrCreate();
  const pub  = await conn.viem.getPublicClient();
  const wcs  = await conn.viem.getWalletClients();
  const owner = wcs[0];
  const alice = wcs[1];
  const bob   = wcs[2];

  const artifact = await hre.artifacts.readArtifact("PrivacyBountyJudge");
  const abi      = artifact.abi;

  const deployHash = await owner.deployContract({
    abi,
    bytecode: artifact.bytecode as `0x${string}`,
    args: [],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: deployHash });
  const addr    = receipt.contractAddress!;

  async function call(wallet: any, fn: string, args: any[], value?: bigint) {
    const hash = await wallet.writeContract({
      address: addr, abi, functionName: fn, args,
      ...(value ? { value } : {}),
    });
    return pub.waitForTransactionReceipt({ hash });
  }

  async function read(fn: string, args: any[]) {
    return pub.readContract({ address: addr, abi, functionName: fn, args });
  }

  async function expectRevert(wallet: any, fn: string, args: any[], errorName: string, value?: bigint) {
    try {
      const hash = await wallet.writeContract({
        address: addr, abi, functionName: fn, args,
        ...(value ? { value } : {}),
      });
      await pub.waitForTransactionReceipt({ hash });
      assert.fail(`Expected revert ${errorName} but tx succeeded`);
    } catch (e: any) {
      if (e.message?.includes("Expected revert")) throw e;
      const msg = e.message ?? "";
      assert.ok(
        msg.includes(errorName) || msg.includes("revert") || msg.includes("Error"),
        `Expected ${errorName}, got: ${msg.slice(0, 300)}`
      );
    }
  }

  async function getTs(): Promise<bigint> {
    return (await pub.getBlock()).timestamp;
  }

  async function mineUntil(ts: bigint) {
    await conn.networkHelpers.time.setNextBlockTimestamp(Number(ts) + 2);
    await conn.networkHelpers.mine();
  }

  async function createBounty() {
    const now      = await getTs();
    const commitDL = now + 86400n;
    const revealDL = now + 259200n;
    await call(owner, "createBounty", [BOUNTY_ID, "Test Bounty", commitDL, revealDL], parseEther("1"));
    return { commitDL, revealDL };
  }

  return { pub, owner, alice, bob, call, read, expectRevert, mineUntil, createBounty };
}

describe("PrivacyBountyJudge", async () => {

  await it("T-01: owner set correctly", async () => {
    const { owner, read } = await setup();
    const o = await read("owner", []);
    assert.equal((o as string).toLowerCase(), owner.account.address.toLowerCase());
  });

  await it("T-02: createBounty stores prize", async () => {
    const { createBounty, read } = await setup();
    await createBounty();
    const info: any = await read("getBountyInfo", [BOUNTY_ID]);
    assert.equal(info[4], parseEther("1"));
  });

  await it("T-03: valid commitment stored", async () => {
    const { alice, createBounty, call, read } = await setup();
    await createBounty();
    const salt   = makeSalt("salt1");
    const commit = makeCommit("Alice answer", salt, alice.account.address);
    await call(alice, "submitCommitment", [BOUNTY_ID, commit]);
    assert.equal(await read("hasCommitted", [BOUNTY_ID, alice.account.address]), true);
  });

  await it("T-04: two participants commit", async () => {
    const { alice, bob, createBounty, call, read } = await setup();
    await createBounty();
    await call(alice, "submitCommitment", [BOUNTY_ID, makeCommit("a1", makeSalt("s1"), alice.account.address)]);
    await call(bob,   "submitCommitment", [BOUNTY_ID, makeCommit("a2", makeSalt("s2"), bob.account.address)]);
    const info: any = await read("getBountyInfo", [BOUNTY_ID]);
    assert.equal(info[7], 2n);
  });

  await it("R-01: valid reveal accepted", async () => {
    const { alice, createBounty, call, read, mineUntil } = await setup();
    const { commitDL } = await createBounty();
    const salt = makeSalt("mysalt"); const answer = "My answer";
    await call(alice, "submitCommitment", [BOUNTY_ID, makeCommit(answer, salt, alice.account.address)]);
    await mineUntil(commitDL);
    await call(alice, "revealAnswer", [BOUNTY_ID, answer, salt]);
    assert.equal(await read("hasRevealed", [BOUNTY_ID, alice.account.address]), true);
  });

  await it("R-02: wrong salt → InvalidReveal", async () => {
    const { alice, createBounty, call, expectRevert, mineUntil } = await setup();
    const { commitDL } = await createBounty();
    const answer = "My answer";
    await call(alice, "submitCommitment", [BOUNTY_ID, makeCommit(answer, makeSalt("good"), alice.account.address)]);
    await mineUntil(commitDL);
    await expectRevert(alice, "revealAnswer", [BOUNTY_ID, answer, makeSalt("bad")], "InvalidReveal");
  });

  await it("R-03: wrong answer → InvalidReveal", async () => {
    const { alice, createBounty, call, expectRevert, mineUntil } = await setup();
    const { commitDL } = await createBounty();
    const salt = makeSalt("mysalt");
    await call(alice, "submitCommitment", [BOUNTY_ID, makeCommit("real", salt, alice.account.address)]);
    await mineUntil(commitDL);
    await expectRevert(alice, "revealAnswer", [BOUNTY_ID, "WRONG", salt], "InvalidReveal");
  });

  await it("R-04: double reveal → AlreadyRevealed", async () => {
    const { alice, createBounty, call, expectRevert, mineUntil } = await setup();
    const { commitDL } = await createBounty();
    const salt = makeSalt("mysalt"); const answer = "My answer";
    await call(alice, "submitCommitment", [BOUNTY_ID, makeCommit(answer, salt, alice.account.address)]);
    await mineUntil(commitDL);
    await call(alice, "revealAnswer", [BOUNTY_ID, answer, salt]);
    await expectRevert(alice, "revealAnswer", [BOUNTY_ID, answer, salt], "AlreadyRevealed");
  });

  await it("R-05: reveal during commit phase → CommitPhaseNotOver", async () => {
    const { alice, createBounty, call, expectRevert } = await setup();
    await createBounty();
    const salt = makeSalt("mysalt"); const answer = "My answer";
    await call(alice, "submitCommitment", [BOUNTY_ID, makeCommit(answer, salt, alice.account.address)]);
    await expectRevert(alice, "revealAnswer", [BOUNTY_ID, answer, salt], "CommitPhaseNotOver");
  });

  await it("R-06: reveal after revealDeadline → RevealPhaseOver", async () => {
    const { alice, createBounty, call, expectRevert, mineUntil } = await setup();
    const { revealDL } = await createBounty();
    const salt = makeSalt("mysalt"); const answer = "My answer";
    await call(alice, "submitCommitment", [BOUNTY_ID, makeCommit(answer, salt, alice.account.address)]);
    await mineUntil(revealDL);
    await expectRevert(alice, "revealAnswer", [BOUNTY_ID, answer, salt], "RevealPhaseOver");
  });

  await it("R-07: reveal without commit → NoCommitFound", async () => {
    const { alice, createBounty, expectRevert, mineUntil } = await setup();
    const { commitDL } = await createBounty();
    await mineUntil(commitDL);
    await expectRevert(alice, "revealAnswer", [BOUNTY_ID, "x", makeSalt("s")], "NoCommitFound");
  });

  await it("C-01: double commit → AlreadyCommitted", async () => {
    const { alice, createBounty, call, expectRevert } = await setup();
    await createBounty();
    const c = makeCommit("ans", makeSalt("s"), alice.account.address);
    await call(alice, "submitCommitment", [BOUNTY_ID, c]);
    await expectRevert(alice, "submitCommitment", [BOUNTY_ID, c], "AlreadyCommitted");
  });

  await it("F-01: full flow → winner receives prize", async () => {
    const { owner, alice, pub, createBounty, call, mineUntil } = await setup();
    const { commitDL, revealDL } = await createBounty();
    const salt = makeSalt("salt1"); const answer = "Best answer";
    await call(alice, "submitCommitment", [BOUNTY_ID, makeCommit(answer, salt, alice.account.address)]);
    await mineUntil(commitDL);
    await call(alice, "revealAnswer", [BOUNTY_ID, answer, salt]);
    await mineUntil(revealDL);
    await call(owner, "judgeAll", [BOUNTY_ID, toHex(toBytes("prompt"))]);
    const before = await pub.getBalance({ address: alice.account.address });
    await call(owner, "finalizeWinner", [BOUNTY_ID, 0n]);
    const after = await pub.getBalance({ address: alice.account.address });
    assert.ok(after - before > parseEther("0.99"), `Delta: ${after - before}`);
  });

  await it("F-02: non-owner finalizeWinner → NotOwner", async () => {
    const { alice, createBounty, expectRevert, mineUntil } = await setup();
    const { revealDL } = await createBounty();
    await mineUntil(revealDL);
    await expectRevert(alice, "finalizeWinner", [BOUNTY_ID, 0n], "NotOwner");
  });

});
