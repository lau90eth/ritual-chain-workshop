// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  PrivacyBountyJudgeAdvanced
 * @notice Advanced track: encrypted submissions stay hidden until Ritual TEE
 *         completes batch AI judging. Plaintext never touches the chain.
 *
 * @dev    Flow:
 *         1. Participant encrypts answer off-chain with Ritual TEE public key
 *         2. Submits ciphertext + keccak256(ciphertext, salt, sender, bountyId)
 *         3. After deadline, Ritual TEE decrypts batch, runs LLM, posts winner
 *         4. Owner (or Ritual callback) calls finalizeWinner()
 *
 * @author lau90.eth – Ritual Academy Assignment (Advanced Track)
 */
contract PrivacyBountyJudgeAdvanced {

    // ─── ERRORS ───────────────────────────────────────────
    error NotOwner();
    error NotOracle();
    error BountyNotFound();
    error BountyAlreadyExists();
    error SubmitPhaseOver();
    error SubmitPhaseNotOver();
    error AlreadySubmitted();
    error WinnerAlreadyFinalized();
    error InvalidWinnerIndex();
    error NothingToJudge();
    error ZeroCommitment();
    error EmptyCiphertext();
    error JudgingAlreadyRequested();

    // ─── EVENTS ───────────────────────────────────────────

    /// @notice Emitted when a new bounty is created.
    event BountyCreated(
        uint256 indexed bountyId,
        address indexed creator,
        string  title,
        uint256 submitDeadline,
        uint256 prize
    );

    /// @notice Emitted when an encrypted submission is stored.
    event EncryptedSubmissionStored(
        uint256 indexed bountyId,
        address indexed participant,
        bytes   ciphertext,
        bytes32 commitment
    );

    /// @notice Emitted to trigger Ritual TEE batch judging.
    event BatchJudgeRequested(
        uint256 indexed bountyId,
        uint256 submissionCount,
        bytes   llmPrompt
    );

    /// @notice Emitted when Ritual oracle posts the winner.
    event WinnerPosted(
        uint256 indexed bountyId,
        uint256 winnerIndex,
        address indexed winner
    );

    /// @notice Emitted when prize is transferred.
    event WinnerFinalized(
        uint256 indexed bountyId,
        address indexed winner,
        uint256 prize
    );

    event PrizeDeposited(uint256 indexed bountyId, uint256 amount);

    // ─── STRUCTS ──────────────────────────────────────────

    struct EncryptedSubmission {
        address participant;
        bytes   ciphertext;  // ECIES-encrypted answer (Ritual TEE pubkey)
        bytes32 commitment;  // keccak256(ciphertext, salt, sender, bountyId)
    }

    struct Bounty {
        address creator;
        string  title;
        uint256 submitDeadline;
        uint256 prize;
        bool    judgingRequested;
        bool    finalized;
        address winner;
        uint256 winnerIndex;
        EncryptedSubmission[] submissions;
    }

    // ─── STATE ────────────────────────────────────────────

    address public immutable owner;

    /// @notice Ritual TEE oracle address — posts judging results on-chain.
    /// @dev    In production: Ritual's verifiable compute callback address.
    address public ritualOracle;

    mapping(uint256 => Bounty) private bounties;
    mapping(uint256 => mapping(address => bool)) private hasSubmitted;
    mapping(uint256 => bool) private bountyExists;

    // ─── MODIFIERS ────────────────────────────────────────

    modifier onlyOwner()  { if (msg.sender != owner)        revert NotOwner();  _; }
    modifier onlyOracle() { if (msg.sender != ritualOracle) revert NotOracle(); _; }
    modifier exists(uint256 id) { if (!bountyExists[id]) revert BountyNotFound(); _; }
    modifier duringSubmit(uint256 id) {
        if (block.timestamp > bounties[id].submitDeadline) revert SubmitPhaseOver();
        _;
    }
    modifier afterSubmit(uint256 id) {
        if (block.timestamp <= bounties[id].submitDeadline) revert SubmitPhaseNotOver();
        _;
    }
    modifier notFinalized(uint256 id) {
        if (bounties[id].finalized) revert WinnerAlreadyFinalized();
        _;
    }

    // ─── CONSTRUCTOR ──────────────────────────────────────

    constructor(address _ritualOracle) {
        owner        = msg.sender;
        ritualOracle = _ritualOracle;
    }

    // ─── BOUNTY MANAGEMENT ────────────────────────────────

    /**
     * @notice Create a bounty. ETH sent = prize pool.
     * @param bountyId      Unique ID chosen by creator.
     * @param title         Human-readable title.
     * @param submitDeadline Unix timestamp — end of submission phase.
     */
    function createBounty(
        uint256 bountyId,
        string calldata title,
        uint256 submitDeadline
    ) external payable {
        if (bountyExists[bountyId])              revert BountyAlreadyExists();
        require(submitDeadline > block.timestamp, "deadline in the past");

        bountyExists[bountyId] = true;
        Bounty storage b = bounties[bountyId];
        b.creator       = msg.sender;
        b.title         = title;
        b.submitDeadline = submitDeadline;
        b.prize         = msg.value;

        emit BountyCreated(bountyId, msg.sender, title, submitDeadline, msg.value);
        if (msg.value > 0) emit PrizeDeposited(bountyId, msg.value);
    }

    function depositPrize(uint256 bountyId) external payable exists(bountyId) {
        require(msg.value > 0, "zero");
        bounties[bountyId].prize += msg.value;
        emit PrizeDeposited(bountyId, msg.value);
    }

    // ─── SUBMIT PHASE ────────────────────────────────────

    /**
     * @notice Submit an encrypted answer during the submission phase.
     *
     * @dev    `ciphertext` = ECIES(answer, ritualTEE_pubkey)
     *         `commitment` = keccak256(abi.encodePacked(ciphertext, salt, msg.sender, bountyId))
     *
     *         The commitment prevents ciphertext substitution attacks:
     *         an attacker cannot swap their ciphertext for a better one
     *         after seeing others' submissions, because the salt binding
     *         makes the commitment non-transferable.
     *
     * @param bountyId   Target bounty.
     * @param ciphertext ECIES-encrypted answer bytes.
     * @param commitment keccak256(ciphertext, salt, sender, bountyId).
     */
    function submitEncrypted(
        uint256 bountyId,
        bytes   calldata ciphertext,
        bytes32 commitment
    )
        external
        exists(bountyId)
        duringSubmit(bountyId)
    {
        if (ciphertext.length == 0)             revert EmptyCiphertext();
        if (commitment == bytes32(0))           revert ZeroCommitment();
        if (hasSubmitted[bountyId][msg.sender]) revert AlreadySubmitted();

        hasSubmitted[bountyId][msg.sender] = true;

        bounties[bountyId].submissions.push(EncryptedSubmission({
            participant: msg.sender,
            ciphertext:  ciphertext,
            commitment:  commitment
        }));

        emit EncryptedSubmissionStored(bountyId, msg.sender, ciphertext, commitment);
    }

    // ─── JUDGE PHASE (RITUAL TEE) ─────────────────────────

    /**
     * @notice Trigger batch AI judging via Ritual TEE.
     *
     * @dev    Emits BatchJudgeRequested with all ciphertexts encoded in llmPrompt.
     *         Ritual's Infernet node listens for this event, decrypts submissions
     *         inside the TEE, runs the LLM batch inference, then calls postWinner().
     *
     *         The llmPrompt parameter contains:
     *         - ABI-encoded array of (participant, ciphertext) pairs
     *         - Evaluation criteria for the LLM
     *
     * @param bountyId  Target bounty.
     * @param llmPrompt ABI-encoded judging prompt + submission metadata.
     */
    function judgeAll(uint256 bountyId, bytes calldata llmPrompt)
        external
        onlyOwner
        exists(bountyId)
        afterSubmit(bountyId)
        notFinalized(bountyId)
    {
        Bounty storage b = bounties[bountyId];
        if (b.submissions.length == 0)  revert NothingToJudge();
        if (b.judgingRequested)         revert JudgingAlreadyRequested();

        b.judgingRequested = true;

        // ── RITUAL INTEGRATION POINT ─────────────────────────────────────
        // Ritual Infernet node subscribes to BatchJudgeRequested events.
        // On receipt:
        //   1. TEE decrypts each ciphertext using the TEE private key
        //   2. Constructs batch LLM prompt with all plaintext answers
        //   3. Runs single LLM inference call (not N separate calls)
        //   4. Signs result with TEE attestation key
        //   5. Calls postWinner(bountyId, winnerIndex) on this contract
        // ─────────────────────────────────────────────────────────────────

        emit BatchJudgeRequested(bountyId, b.submissions.length, llmPrompt);
    }

    /**
     * @notice Called by Ritual TEE oracle to post the winning index.
     * @dev    In production: verified by checking TEE attestation signature.
     *         Only ritualOracle address can call this.
     *
     * @param bountyId    Target bounty.
     * @param winnerIndex Index of winning submission in bounty.submissions.
     */
    function postWinner(uint256 bountyId, uint256 winnerIndex)
        external
        onlyOracle
        exists(bountyId)
        notFinalized(bountyId)
    {
        Bounty storage b = bounties[bountyId];
        require(b.judgingRequested, "judging not requested");
        if (winnerIndex >= b.submissions.length) revert InvalidWinnerIndex();

        b.finalized   = true;
        b.winner      = b.submissions[winnerIndex].participant;
        b.winnerIndex = winnerIndex;

        emit WinnerPosted(bountyId, winnerIndex, b.winner);

        uint256 prize = b.prize;
        b.prize = 0;

        emit WinnerFinalized(bountyId, b.winner, prize);

        if (prize > 0) {
            (bool ok, ) = b.winner.call{value: prize}("");
            require(ok, "transfer failed");
        }
    }

    /**
     * @notice Emergency finalize by owner (fallback if oracle is down).
     * @dev    Requires judging to have been requested first.
     */
    function finalizeWinner(uint256 bountyId, uint256 winnerIndex)
        external
        onlyOwner
        exists(bountyId)
        notFinalized(bountyId)
    {
        Bounty storage b = bounties[bountyId];
        require(b.judgingRequested, "call judgeAll first");
        if (winnerIndex >= b.submissions.length) revert InvalidWinnerIndex();

        b.finalized   = true;
        b.winner      = b.submissions[winnerIndex].participant;
        b.winnerIndex = winnerIndex;

        uint256 prize = b.prize;
        b.prize = 0;

        emit WinnerFinalized(bountyId, b.winner, prize);

        if (prize > 0) {
            (bool ok, ) = b.winner.call{value: prize}("");
            require(ok, "transfer failed");
        }
    }

    // ─── ADMIN ────────────────────────────────────────────

    /// @notice Update Ritual oracle address (owner only).
    function setRitualOracle(address _oracle) external onlyOwner {
        ritualOracle = _oracle;
    }

    // ─── VIEWS ────────────────────────────────────────────

    function getBountyInfo(uint256 bountyId) external view exists(bountyId)
        returns (
            address creator,
            string  memory title,
            uint256 submitDeadline,
            uint256 prize,
            bool    judgingRequested,
            bool    finalized,
            address winner,
            uint256 submissionCount
        )
    {
        Bounty storage b = bounties[bountyId];
        return (b.creator, b.title, b.submitDeadline, b.prize,
                b.judgingRequested, b.finalized, b.winner, b.submissions.length);
    }

    /// @notice Returns all ciphertexts — readable by Ritual TEE after deadline.
    function getSubmissions(uint256 bountyId) external view exists(bountyId)
        returns (address[] memory participants, bytes[] memory ciphertexts)
    {
        Bounty storage b = bounties[bountyId];
        require(block.timestamp > b.submitDeadline, "submit phase active");
        uint256 n = b.submissions.length;
        participants = new address[](n);
        ciphertexts  = new bytes[](n);
        for (uint256 i; i < n; ++i) {
            participants[i] = b.submissions[i].participant;
            ciphertexts[i]  = b.submissions[i].ciphertext;
        }
    }

    function hasParticipated(uint256 bountyId, address p) external view returns (bool) {
        return hasSubmitted[bountyId][p];
    }

    /// @notice Helper: compute commitment off-chain.
    function computeCommitment(
        bytes   calldata ciphertext,
        bytes32 salt,
        address participant,
        uint256 bountyId
    ) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(ciphertext, salt, participant, bountyId));
    }

    receive() external payable {}
}
