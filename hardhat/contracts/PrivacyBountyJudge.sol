// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  PrivacyBountyJudge
 * @notice Commit-Reveal bounty system with AI-assisted judging placeholder.
 *         Lifecycle: Create → Commit → Reveal → Judge → Finalize
 *
 * @dev    Commitment hash: keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId))
 *         All timestamps are Unix seconds (block.timestamp).
 *
 * @author lau90.eth  –  Ritual Academy Assignment
 */
contract PrivacyBountyJudge {

    error NotOwner();
    error BountyNotFound();
    error BountyAlreadyExists();
    error CommitPhaseOver();
    error CommitPhaseNotOver();
    error RevealPhaseOver();
    error RevealPhaseNotOver();
    error AlreadyCommitted();
    error NoCommitFound();
    error AlreadyRevealed();
    error InvalidReveal();
    error WinnerAlreadyFinalized();
    error InvalidWinnerIndex();
    error NothingToJudge();
    error ZeroCommitment();
    error EmptyAnswer();
    error ZeroSalt();

    event BountyCreated(uint256 indexed bountyId, address indexed creator, string title, uint256 commitDeadline, uint256 revealDeadline);
    event CommitmentSubmitted(uint256 indexed bountyId, address indexed participant, bytes32 commitment);
    event AnswerRevealed(uint256 indexed bountyId, address indexed participant, string answer);
    event JudgeRequested(uint256 indexed bountyId, uint256 revealCount, bytes llmInput);
    event WinnerFinalized(uint256 indexed bountyId, address indexed winner, uint256 winnerIndex, uint256 prize);
    event PrizeDeposited(uint256 indexed bountyId, uint256 amount);

    struct Submission {
        address participant;
        bytes32 commitment;
        string  answer;
        bytes32 salt;
        bool    revealed;
    }

    struct Bounty {
        address creator;
        string  title;
        uint256 commitDeadline;
        uint256 revealDeadline;
        uint256 prize;
        bool    finalized;
        address winner;
        uint256 winnerIndex;
        Submission[] submissions;
    }

    address public immutable owner;
    mapping(uint256 => Bounty) private bounties;
    mapping(uint256 => mapping(address => uint256)) private participantIndex;
    mapping(uint256 => bool) private bountyExists;

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier bountyMustExist(uint256 id) { if (!bountyExists[id]) revert BountyNotFound(); _; }
    modifier duringCommitPhase(uint256 id) { if (block.timestamp > bounties[id].commitDeadline) revert CommitPhaseOver(); _; }
    modifier duringRevealPhase(uint256 id) {
        if (block.timestamp <= bounties[id].commitDeadline) revert CommitPhaseNotOver();
        if (block.timestamp > bounties[id].revealDeadline)  revert RevealPhaseOver();
        _;
    }
    modifier afterRevealPhase(uint256 id) { if (block.timestamp <= bounties[id].revealDeadline) revert RevealPhaseNotOver(); _; }
    modifier notFinalized(uint256 id) { if (bounties[id].finalized) revert WinnerAlreadyFinalized(); _; }

    constructor() { owner = msg.sender; }

    function createBounty(uint256 bountyId, string calldata title, uint256 commitDeadline, uint256 revealDeadline) external payable {
        if (bountyExists[bountyId]) revert BountyAlreadyExists();
        require(commitDeadline > block.timestamp, "commitDeadline in the past");
        require(revealDeadline > commitDeadline,  "revealDeadline <= commitDeadline");
        bountyExists[bountyId] = true;
        Bounty storage b = bounties[bountyId];
        b.creator        = msg.sender;
        b.title          = title;
        b.commitDeadline = commitDeadline;
        b.revealDeadline = revealDeadline;
        b.prize          = msg.value;
        emit BountyCreated(bountyId, msg.sender, title, commitDeadline, revealDeadline);
        if (msg.value > 0) emit PrizeDeposited(bountyId, msg.value);
    }

    function depositPrize(uint256 bountyId) external payable bountyMustExist(bountyId) {
        require(msg.value > 0, "zero deposit");
        bounties[bountyId].prize += msg.value;
        emit PrizeDeposited(bountyId, msg.value);
    }

    function submitCommitment(uint256 bountyId, bytes32 commitment)
        external bountyMustExist(bountyId) duringCommitPhase(bountyId)
    {
        if (commitment == bytes32(0))                     revert ZeroCommitment();
        if (participantIndex[bountyId][msg.sender] != 0) revert AlreadyCommitted();
        Bounty storage b = bounties[bountyId];
        b.submissions.push(Submission({ participant: msg.sender, commitment: commitment, answer: "", salt: bytes32(0), revealed: false }));
        participantIndex[bountyId][msg.sender] = b.submissions.length;
        emit CommitmentSubmitted(bountyId, msg.sender, commitment);
    }

    function revealAnswer(uint256 bountyId, string calldata answer, bytes32 salt)
        external bountyMustExist(bountyId) duringRevealPhase(bountyId)
    {
        if (bytes(answer).length == 0) revert EmptyAnswer();
        if (salt == bytes32(0))        revert ZeroSalt();
        uint256 idx = participantIndex[bountyId][msg.sender];
        if (idx == 0) revert NoCommitFound();
        Submission storage sub = bounties[bountyId].submissions[idx - 1];
        if (sub.revealed) revert AlreadyRevealed();
        bytes32 expected = keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId));
        if (expected != sub.commitment) revert InvalidReveal();
        sub.answer   = answer;
        sub.salt     = salt;
        sub.revealed = true;
        emit AnswerRevealed(bountyId, msg.sender, answer);
    }

    function judgeAll(uint256 bountyId, bytes calldata llmInput)
        external onlyOwner bountyMustExist(bountyId) afterRevealPhase(bountyId) notFinalized(bountyId)
    {
        Bounty storage b = bounties[bountyId];
        uint256 revealCount = _countRevealed(b);
        if (revealCount == 0) revert NothingToJudge();
        // TODO: Ritual Infernet / Chainlink Functions oracle call
        emit JudgeRequested(bountyId, revealCount, llmInput);
    }

    function finalizeWinner(uint256 bountyId, uint256 winnerIndex)
        external onlyOwner bountyMustExist(bountyId) afterRevealPhase(bountyId) notFinalized(bountyId)
    {
        Bounty storage b = bounties[bountyId];
        if (winnerIndex >= b.submissions.length) revert InvalidWinnerIndex();
        Submission storage winner = b.submissions[winnerIndex];
        if (!winner.revealed) revert InvalidReveal();
        b.finalized   = true;
        b.winner      = winner.participant;
        b.winnerIndex = winnerIndex;
        uint256 prize = b.prize;
        b.prize = 0;
        emit WinnerFinalized(bountyId, winner.participant, winnerIndex, prize);
        if (prize > 0) { (bool ok, ) = winner.participant.call{value: prize}(""); require(ok, "transfer failed"); }
    }

    function getBountyInfo(uint256 bountyId) external view bountyMustExist(bountyId)
        returns (address creator, string memory title, uint256 commitDeadline, uint256 revealDeadline, uint256 prize, bool finalized, address winner, uint256 submissionCount)
    {
        Bounty storage b = bounties[bountyId];
        return (b.creator, b.title, b.commitDeadline, b.revealDeadline, b.prize, b.finalized, b.winner, b.submissions.length);
    }

    function getRevealedSubmissions(uint256 bountyId) external view bountyMustExist(bountyId)
        returns (address[] memory participants, string[] memory answers)
    {
        Bounty storage b = bounties[bountyId];
        if (block.timestamp <= b.revealDeadline) return (new address[](0), new string[](0));
        uint256 count = _countRevealed(b);
        participants = new address[](count);
        answers      = new string[](count);
        uint256 j;
        for (uint256 i; i < b.submissions.length; ++i) {
            if (b.submissions[i].revealed) { participants[j] = b.submissions[i].participant; answers[j] = b.submissions[i].answer; ++j; }
        }
    }

    function hasCommitted(uint256 bountyId, address participant) external view bountyMustExist(bountyId) returns (bool) {
        return participantIndex[bountyId][participant] != 0;
    }

    function hasRevealed(uint256 bountyId, address participant) external view bountyMustExist(bountyId) returns (bool) {
        uint256 idx = participantIndex[bountyId][participant];
        if (idx == 0) return false;
        return bounties[bountyId].submissions[idx - 1].revealed;
    }

    function computeCommitment(string calldata answer, bytes32 salt, address participant, uint256 bountyId) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(answer, salt, participant, bountyId));
    }

    function _countRevealed(Bounty storage b) internal view returns (uint256 count) {
        for (uint256 i; i < b.submissions.length; ++i) { if (b.submissions[i].revealed) ++count; }
    }

    receive() external payable {}
}
