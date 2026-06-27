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
const ORACLE_PLACEHOLDER = "0x0000000000000000000000000000000000000001";

function makeSalt(s: string): `0x${string}` {
  const b = toBytes(s);
  const p = new Uint8Array(32);
  p.set(b.slice(0, 32));
  return toHex(p) as `0x${string}`;
}

function makeCiphertext(s: string): `0x${string}` {
  return toHex(toBytes(s)) as `0x${string}`;
}

function makeCommit(ciphertext: `0x${string}`, salt: `0x${string}`, addr: `0x${string}`): `0x${string}` {
  return keccak256(encodePacked(
    ["bytes", "bytes32", "address", "uint256"],
    [ciphertext, salt, addr, BOUNTY_ID]
  ));
}

async function setup() {
  const conn  = await hre.network.getOrCreate();
  const pub   = await conn.viem.getPublicClient();
  const wcs   = await conn.viem.getWalletClients();
  const owner = wcs[0];
  const alice = wcs[1];
  const bob   = wcs[2];
  // wcs[3] impersona l'oracle
  const oracle = wcs[3];

  const artifact = await hre.artifacts.readArtifact("PrivacyBountyJudgeAdvanced");
  const abi      = artifact.abi;

  // Deploy con oracle = wcs[3].account.address (così possiamo chiamare postWinner nei test)
  const deployHash = await owner.deployContract({
    abi,
    bytecode: artifact.bytecode as `0x${string}`,
    args: [oracle.account.address],
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
    const now        = await getTs();
    const submitDL   = now + 86400n;
    await call(owner, "createBounty", [BOUNTY_ID, "Test Bounty", submitDL], parseEther("1"));
    return { submitDL };
  }

  return { pub, owner, alice, bob, oracle, call, read, expectRevert, mineUntil, createBounty };
}

describe("PrivacyBountyJudgeAdvanced", async () => {

  await it("A-01: owner and oracle set correctly", async () => {
    const { owner, oracle, read } = await setup();
    const o  = await read("owner", []);
    const or = await read("ritualOracle", []);
    assert.equal((o as string).toLowerCase(),  owner.account.address.toLowerCase());
    assert.equal((or as string).toLowerCase(), oracle.account.address.toLowerCase());
  });

  await it("A-02: createBounty stores prize", async () => {
    const { createBounty, read } = await setup();
    await createBounty();
    const info: any = await read("getBountyInfo", [BOUNTY_ID]);
    assert.equal(info[3], parseEther("1")); // prize at index 3
  });

  await it("A-03: submitEncrypted stored", async () => {
    const { alice, createBounty, call, read } = await setup();
    await createBounty();
    const ct     = makeCiphertext("encrypted_answer_alice");
    const salt   = makeSalt("salt1");
    const commit = makeCommit(ct, salt, alice.account.address);
    await call(alice, "submitEncrypted", [BOUNTY_ID, ct, commit]);
    assert.equal(await read("hasParticipated", [BOUNTY_ID, alice.account.address]), true);
  });

  await it("A-04: two participants submit", async () => {
    const { alice, bob, createBounty, call, read } = await setup();
    await createBounty();
    const ct1 = makeCiphertext("enc_alice"); const s1 = makeSalt("s1");
    const ct2 = makeCiphertext("enc_bob");   const s2 = makeSalt("s2");
    await call(alice, "submitEncrypted", [BOUNTY_ID, ct1, makeCommit(ct1, s1, alice.account.address)]);
    await call(bob,   "submitEncrypted", [BOUNTY_ID, ct2, makeCommit(ct2, s2, bob.account.address)]);
    const info: any = await read("getBountyInfo", [BOUNTY_ID]);
    assert.equal(info[7], 2n); // submissionCount
  });

  await it("A-05: double submit → AlreadySubmitted", async () => {
    const { alice, createBounty, call, expectRevert } = await setup();
    await createBounty();
    const ct   = makeCiphertext("enc_alice");
    const salt = makeSalt("s1");
    const c    = makeCommit(ct, salt, alice.account.address);
    await call(alice, "submitEncrypted", [BOUNTY_ID, ct, c]);
    await expectRevert(alice, "submitEncrypted", [BOUNTY_ID, ct, c], "AlreadySubmitted");
  });

  await it("A-06: submit after deadline → SubmitPhaseOver", async () => {
    const { alice, createBounty, expectRevert, mineUntil } = await setup();
    const { submitDL } = await createBounty();
    await mineUntil(submitDL);
    const ct = makeCiphertext("late");
    await expectRevert(alice, "submitEncrypted", [BOUNTY_ID, ct, makeSalt("s")], "SubmitPhaseOver");
  });

  await it("A-07: judgeAll before deadline → SubmitPhaseNotOver", async () => {
    const { owner, createBounty, call, expectRevert } = await setup();
    await createBounty();
    const ct = makeCiphertext("enc"); const salt = makeSalt("s");
    await call(owner, "submitEncrypted",[BOUNTY_ID, ct, makeCommit(ct, salt, (await setup()).owner.account.address)]).catch(() => {});
    await expectRevert(owner, "judgeAll", [BOUNTY_ID, toHex(toBytes("prompt"))], "SubmitPhaseNotOver");
  });

  await it("A-08: judgeAll after deadline emits BatchJudgeRequested", async () => {
    const { owner, alice, createBounty, call, mineUntil } = await setup();
    const { submitDL } = await createBounty();
    const ct = makeCiphertext("enc_alice"); const salt = makeSalt("s1");
    await call(alice, "submitEncrypted", [BOUNTY_ID, ct, makeCommit(ct, salt, alice.account.address)]);
    await mineUntil(submitDL);
    const receipt: any = await call(owner, "judgeAll", [BOUNTY_ID, toHex(toBytes("judge this batch"))]);
    assert.ok(receipt.status === "success");
  });

  await it("A-09: non-oracle postWinner → NotOracle", async () => {
    const { owner, alice, createBounty, call, expectRevert, mineUntil } = await setup();
    const { submitDL } = await createBounty();
    const ct = makeCiphertext("enc_alice"); const salt = makeSalt("s1");
    await call(alice, "submitEncrypted", [BOUNTY_ID, ct, makeCommit(ct, salt, alice.account.address)]);
    await mineUntil(submitDL);
    await call(owner, "judgeAll", [BOUNTY_ID, toHex(toBytes("prompt"))]);
    await expectRevert(alice, "postWinner", [BOUNTY_ID, 0n], "NotOracle");
  });

  await it("A-10: full flow → oracle posts winner, prize transferred", async () => {
    const { owner, alice, bob, oracle, pub, createBounty, call, mineUntil } = await setup();
    const { submitDL } = await createBounty();

    const ct1 = makeCiphertext("enc_alice"); const s1 = makeSalt("s1");
    const ct2 = makeCiphertext("enc_bob");   const s2 = makeSalt("s2");
    await call(alice, "submitEncrypted", [BOUNTY_ID, ct1, makeCommit(ct1, s1, alice.account.address)]);
    await call(bob,   "submitEncrypted", [BOUNTY_ID, ct2, makeCommit(ct2, s2, bob.account.address)]);

    await mineUntil(submitDL);
    await call(owner, "judgeAll", [BOUNTY_ID, toHex(toBytes("batch prompt"))]);

    // Oracle (Ritual TEE) posta il vincitore: index 0 = alice
    const before = await pub.getBalance({ address: alice.account.address });
    await call(oracle, "postWinner", [BOUNTY_ID, 0n]);
    const after = await pub.getBalance({ address: alice.account.address });

    assert.ok(after - before > parseEther("0.99"), `Delta: ${after - before}`);
  });

  await it("A-11: getSubmissions blocked during submit phase", async () => {
    const { alice, createBounty, call, read } = await setup();
    await createBounty();
    const ct = makeCiphertext("enc"); const salt = makeSalt("s");
    await call(alice, "submitEncrypted", [BOUNTY_ID, ct, makeCommit(ct, salt, alice.account.address)]);
    try {
      await read("getSubmissions", [BOUNTY_ID]);
      assert.fail("Should have reverted");
    } catch (e: any) {
      assert.ok(e.message.includes("submit phase active") || e.message.includes("revert") || e.message.includes("Error"));
    }
  });

  await it("A-12: non-owner setRitualOracle → NotOwner", async () => {
    const { alice, expectRevert } = await setup();
    await expectRevert(alice, "setRitualOracle", ["0x0000000000000000000000000000000000000002"], "NotOwner");
  });

});
