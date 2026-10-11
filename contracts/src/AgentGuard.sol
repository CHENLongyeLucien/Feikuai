// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Opt-in delegated payment vault. Existing PaymentGuard/AutomationGuard deployments are unaffected.
/// @dev Authenticates runtime statements, not their causal truth. A compromised attestor can lie about origin.
contract AgentGuard is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Origin {
        Human,
        Agent,
        ExternalDocument
    }
    enum Status {
        None,
        Pending,
        Executed,
        Rejected,
        Expired
    }
    enum Reason {
        None,
        UnknownGrant,
        UnauthorizedAgent,
        InvalidRuntimeSignature,
        NonceUnavailable,
        MalformedRequest,
        WrongToken,
        Expired,
        Paused,
        Revoked,
        InactiveGrant,
        RecipientNotAllowed,
        TransferLimit,
        DailyLimit,
        FrequencyLimit,
        OriginChainMissing,
        HumanApprovalRequired,
        OwnerRejected
    }

    struct Limits {
        uint256 maxPerTransferAtomic;
        uint256 dailyLimitAtomic;
        uint256 autoApproveThresholdAtomic;
        uint64 validAfter;
        uint64 expiresAt;
        uint8 maxPaymentsPerWindow;
        bool canDelegate;
    }

    struct Delegation {
        uint256 parentId;
        address issuer;
        address agent;
        uint8 depth;
        bool revoked;
        Limits limits;
    }

    struct RuntimePayment {
        uint256 grantId;
        address recipient;
        address token;
        uint256 amountAtomic;
        uint256 nonce;
        uint64 issuedAt;
        uint64 deadline;
        Origin origin;
        address originActor;
        bytes32 sourceCommitment;
        bytes32 evidenceCommitment;
    }

    struct RequestRecord {
        RuntimePayment payment;
        Status status;
        Reason reason;
    }

    struct DailyUsage {
        uint64 day;
        uint256 spentAtomic;
    }

    struct Frequency {
        uint64[64] timestamps;
        uint8 cursor;
        uint8 count;
    }

    struct Refusals {
        uint64[3] timestamps;
        uint8 cursor;
        uint8 count;
    }

    error InvalidConfiguration();
    error UnauthorizedOwner();
    error UnauthorizedDelegation();
    error InvalidDelegation();
    error UnauthorizedMonitor();
    error UnauthorizedRecorder();
    error NotPending();
    error NotExpired();
    error InvalidAnchor();
    error InexactTokenTransfer();

    uint8 public constant MAX_DEPTH = 8;
    uint8 public constant MAX_FREQUENCY = 64;
    uint64 public constant FREQUENCY_WINDOW = 60;
    uint64 public constant REFUSAL_WINDOW = 600;
    uint64 public constant MAX_REQUEST_TTL = 600;
    bytes32 public constant RUNTIME_PAYMENT_TYPEHASH = keccak256(
        "RuntimePayment(uint256 grantId,address recipient,address token,uint256 amountAtomic,uint256 nonce,uint64 issuedAt,uint64 deadline,uint8 origin,address originActor,bytes32 sourceCommitment,bytes32 evidenceCommitment)"
    );

    address public immutable token;
    address public immutable owner;
    address public immutable runtimeAttestor;
    address public immutable monitor;
    address public immutable recorder;
    uint256 public immutable maxPerTransferAtomic;
    uint256 public immutable dailyLimitAtomic;
    uint256 public immutable autoApproveThresholdAtomic;
    uint8 public immutable maxPaymentsPerWindow;
    bytes32 public immutable registryHash;
    bool public paused;
    uint256 public lastGrantId;
    mapping(address => bool) public allowedRecipient;
    mapping(uint256 => Delegation) private delegations;
    mapping(uint256 => mapping(address => bool)) public delegationRecipient;
    mapping(address => mapping(uint256 => bool)) public nonceUsed;
    mapping(bytes32 => RequestRecord) private requests;
    // ID 0 is the shared vault-wide budget: separate root grants cannot multiply it.
    mapping(uint256 => DailyUsage) public dailyUsage;
    mapping(uint256 => Frequency) private frequencies;
    mapping(address => Refusals) private refusals;
    mapping(bytes32 => bytes32) public anchoredHash;

    event DelegationRegistered(
        uint256 indexed grantId,
        uint256 indexed parentId,
        address indexed agent,
        address issuer,
        Limits limits,
        bytes32 recipientsHash
    );
    event DelegationRevoked(uint256 indexed grantId, address indexed by);
    event RequestPending(
        bytes32 indexed requestId,
        uint256 indexed grantId,
        address indexed agent,
        address recipient,
        uint256 amountAtomic,
        uint64 deadline,
        Origin origin,
        address originActor,
        bytes32 sourceCommitment,
        bytes32 evidenceCommitment
    );
    event RequestDenied(bytes32 indexed requestId, address indexed caller, Reason reason, bool authenticated);
    event RequestExpired(bytes32 indexed requestId);
    event OwnerApproved(bytes32 indexed requestId, address indexed owner);
    event AgentPaymentExecuted(
        bytes32 indexed requestId,
        uint256 indexed grantId,
        address indexed agent,
        address recipient,
        address token,
        uint256 amountAtomic,
        uint256 nonce,
        Origin origin,
        address originActor,
        bytes32 sourceCommitment,
        bytes32 evidenceCommitment
    );
    event Paused(address indexed by, bytes32 indexed incidentCommitment, Reason reason);
    event Resumed(address indexed owner);
    event DecisionBatchAnchored(bytes32 indexed anchorId, bytes32 indexed root, uint32 leafCount, bytes32 manifestHash);
    event ReportAnchored(bytes32 indexed anchorId, bytes32 indexed reportHash);

    constructor(
        address token_,
        address owner_,
        address attestor_,
        address monitor_,
        address recorder_,
        uint256 maxTransfer_,
        uint256 dailyLimit_,
        uint256 autoThreshold_,
        uint8 maxFrequency_,
        address[] memory recipients_
    ) EIP712("AgentGuard", "1") {
        if (
            token_.code.length == 0 || owner_ == address(0) || attestor_ == address(0) || monitor_ == address(0)
                || recorder_ == address(0) || owner_ == attestor_ || owner_ == monitor_ || owner_ == recorder_
                || attestor_ == monitor_ || attestor_ == recorder_ || monitor_ == recorder_ || maxTransfer_ == 0
                || dailyLimit_ < maxTransfer_ || autoThreshold_ > maxTransfer_ || maxFrequency_ == 0
                || maxFrequency_ > MAX_FREQUENCY || recipients_.length == 0 || recipients_.length > 32
        ) revert InvalidConfiguration();
        try IERC20Metadata(token_).decimals() returns (uint8 decimals_) {
            if (decimals_ != 6) revert InvalidConfiguration();
        } catch {
            revert InvalidConfiguration();
        }
        address previous;
        for (uint256 i; i < recipients_.length; ++i) {
            address recipient = recipients_[i];
            if (recipient <= previous || recipient == address(this)) revert InvalidConfiguration();
            previous = recipient;
            allowedRecipient[recipient] = true;
        }
        token = token_;
        owner = owner_;
        runtimeAttestor = attestor_;
        monitor = monitor_;
        recorder = recorder_;
        maxPerTransferAtomic = maxTransfer_;
        dailyLimitAtomic = dailyLimit_;
        autoApproveThresholdAtomic = autoThreshold_;
        maxPaymentsPerWindow = maxFrequency_;
        registryHash = keccak256(abi.encode(recipients_));
    }

    function getDelegation(uint256 grantId) external view returns (Delegation memory) {
        return delegations[grantId];
    }

    function getRequest(bytes32 requestId) external view returns (RequestRecord memory) {
        return requests[requestId];
    }

    /// @notice A root requires an owner transaction; a child requires its immediate parent's delegate.
    function registerDelegation(uint256 parentId, address agent, Limits calldata limits, address[] calldata recipients)
        external
        returns (uint256 grantId)
    {
        if (
            agent == address(0) || agent == owner || agent == runtimeAttestor || agent == monitor || agent == recorder
                || agent == address(this) || recipients.length == 0 || recipients.length > 32
                || limits.maxPerTransferAtomic == 0 || limits.dailyLimitAtomic < limits.maxPerTransferAtomic
                || limits.autoApproveThresholdAtomic > limits.maxPerTransferAtomic
                || limits.expiresAt <= block.timestamp || limits.expiresAt <= limits.validAfter
                || limits.maxPerTransferAtomic > maxPerTransferAtomic || limits.dailyLimitAtomic > dailyLimitAtomic
                || limits.autoApproveThresholdAtomic > autoApproveThresholdAtomic || limits.maxPaymentsPerWindow == 0
                || limits.maxPaymentsPerWindow > maxPaymentsPerWindow
        ) revert InvalidDelegation();
        uint8 depth = 1;
        if (parentId == 0) {
            if (msg.sender != owner) revert UnauthorizedDelegation();
        } else {
            Delegation storage parent = delegations[parentId];
            if (parent.agent != msg.sender || !parent.limits.canDelegate) revert UnauthorizedDelegation();
            if (
                parent.depth >= MAX_DEPTH || limits.expiresAt > parent.limits.expiresAt
                    || limits.validAfter < parent.limits.validAfter
                    || limits.maxPerTransferAtomic > parent.limits.maxPerTransferAtomic
                    || limits.dailyLimitAtomic > parent.limits.dailyLimitAtomic
                    || limits.autoApproveThresholdAtomic > parent.limits.autoApproveThresholdAtomic
                    || limits.maxPaymentsPerWindow > parent.limits.maxPaymentsPerWindow
            ) revert InvalidDelegation();
            depth = parent.depth + 1;
            for (uint256 id = parentId; id != 0; id = delegations[id].parentId) {
                Delegation storage ancestor = delegations[id];
                if (
                    ancestor.revoked || block.timestamp < ancestor.limits.validAfter
                        || block.timestamp >= ancestor.limits.expiresAt || ancestor.agent == agent
                ) revert InvalidDelegation();
            }
        }
        grantId = ++lastGrantId;
        address previous;
        for (uint256 i; i < recipients.length; ++i) {
            address recipient = recipients[i];
            if (
                recipient <= previous || !allowedRecipient[recipient]
                    || (parentId != 0 && !delegationRecipient[parentId][recipient])
            ) revert InvalidDelegation();
            previous = recipient;
            delegationRecipient[grantId][recipient] = true;
        }
        delegations[grantId] = Delegation(parentId, msg.sender, agent, depth, false, limits);
        emit DelegationRegistered(grantId, parentId, agent, msg.sender, limits, keccak256(abi.encode(recipients)));
    }

    function revokeDelegation(uint256 grantId) external {
        Delegation storage grant = delegations[grantId];
        if (grant.agent == address(0)) revert InvalidDelegation();
        if (msg.sender != owner && msg.sender != grant.issuer) revert UnauthorizedDelegation();
        grant.revoked = true;
        emit DelegationRevoked(grantId, msg.sender);
    }

    function hashRequest(RuntimePayment memory payment) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    RUNTIME_PAYMENT_TYPEHASH,
                    payment.grantId,
                    payment.recipient,
                    payment.token,
                    payment.amountAtomic,
                    payment.nonce,
                    payment.issuedAt,
                    payment.deadline,
                    payment.origin,
                    payment.originActor,
                    payment.sourceCommitment,
                    payment.evidenceCommitment
                )
            )
        );
    }

    /// @notice A successful transaction may record rejection/pending; only AgentPaymentExecuted establishes payment.
    /// @dev Only distinct, runtime-authenticated requests from the registered leaf can trip the rejection circuit.
    function submitRequest(RuntimePayment calldata payment, bytes calldata runtimeSignature)
        external
        nonReentrant
        returns (bytes32 requestId, Status status, Reason reason)
    {
        requestId = hashRequest(payment);
        Delegation storage leaf = delegations[payment.grantId];
        if (leaf.agent == address(0)) return _unauthenticated(requestId, Reason.UnknownGrant);
        if (msg.sender != leaf.agent) return _unauthenticated(requestId, Reason.UnauthorizedAgent);
        (address signer, ECDSA.RecoverError recoveryError,) = ECDSA.tryRecover(requestId, runtimeSignature);
        if (recoveryError != ECDSA.RecoverError.NoError || signer != runtimeAttestor) {
            return _unauthenticated(requestId, Reason.InvalidRuntimeSignature);
        }
        if (nonceUsed[msg.sender][payment.nonce]) return _unauthenticated(requestId, Reason.NonceUnavailable);
        nonceUsed[msg.sender][payment.nonce] = true;
        requests[requestId].payment = payment;
        reason = _validate(payment);
        if (reason != Reason.None) return _deny(requestId, payment.grantId, reason);
        if (_requiresHuman(payment)) {
            requests[requestId].status = Status.Pending;
            requests[requestId].reason = Reason.HumanApprovalRequired;
            emit RequestPending(
                requestId,
                payment.grantId,
                leaf.agent,
                payment.recipient,
                payment.amountAtomic,
                payment.deadline,
                payment.origin,
                payment.originActor,
                payment.sourceCommitment,
                payment.evidenceCommitment
            );
            return (requestId, Status.Pending, Reason.HumanApprovalRequired);
        }
        _execute(requestId, payment);
        return (requestId, Status.Executed, Reason.None);
    }

    /// @notice The owner's wallet transaction approves this exact stored request, including its evidence and origin.
    function approveRequest(bytes32 requestId) external nonReentrant returns (Status status, Reason reason) {
        if (msg.sender != owner) revert UnauthorizedOwner();
        RequestRecord storage record = requests[requestId];
        if (record.status != Status.Pending) revert NotPending();
        reason = _validate(record.payment);
        if (reason != Reason.None) {
            (, status,) = _deny(requestId, record.payment.grantId, reason);
            return (status, reason);
        }
        emit OwnerApproved(requestId, msg.sender);
        _execute(requestId, record.payment);
        return (Status.Executed, Reason.None);
    }

    function rejectRequest(bytes32 requestId) external {
        if (msg.sender != owner) revert UnauthorizedOwner();
        RequestRecord storage record = requests[requestId];
        if (record.status != Status.Pending) revert NotPending();
        record.status = Status.Rejected;
        record.reason = Reason.OwnerRejected;
        emit RequestDenied(requestId, msg.sender, Reason.OwnerRejected, true);
    }

    function expireRequest(bytes32 requestId) external {
        RequestRecord storage record = requests[requestId];
        if (record.status != Status.Pending) revert NotPending();
        if (block.timestamp < record.payment.deadline) revert NotExpired();
        record.status = Status.Expired;
        record.reason = Reason.Expired;
        emit RequestExpired(requestId);
    }

    function _validate(RuntimePayment memory payment) private view returns (Reason) {
        if (paused) return Reason.Paused;
        if (
            payment.nonce == 0 || payment.amountAtomic == 0 || payment.sourceCommitment == bytes32(0)
                || payment.evidenceCommitment == bytes32(0) || payment.deadline <= payment.issuedAt
                || payment.deadline - payment.issuedAt > MAX_REQUEST_TTL || payment.issuedAt > block.timestamp
        ) return Reason.MalformedRequest;
        if (block.timestamp >= payment.deadline) return Reason.Expired;
        if (payment.token != token) return Reason.WrongToken;
        if (!allowedRecipient[payment.recipient]) return Reason.RecipientNotAllowed;
        if (payment.amountAtomic > maxPerTransferAtomic) return Reason.TransferLimit;
        bool originFound;
        bool dailyAvailable = true;
        bool frequencyAvailable = true;
        if (payment.origin == Origin.Human) {
            if (payment.originActor != owner) return Reason.OriginChainMissing;
            originFound = true;
        } else if (payment.origin == Origin.ExternalDocument) {
            if (payment.originActor != address(0)) return Reason.OriginChainMissing;
            originFound = true;
        }
        for (uint256 id = payment.grantId; id != 0; id = delegations[id].parentId) {
            Delegation storage grant = delegations[id];
            if (grant.revoked) return Reason.Revoked;
            if (block.timestamp < grant.limits.validAfter || block.timestamp >= grant.limits.expiresAt) {
                return Reason.InactiveGrant;
            }
            if (!delegationRecipient[id][payment.recipient]) return Reason.RecipientNotAllowed;
            if (payment.amountAtomic > grant.limits.maxPerTransferAtomic) return Reason.TransferLimit;
            if (id != payment.grantId && grant.agent == payment.originActor) originFound = true;
            if (!_dailyAvailable(id, grant.limits.dailyLimitAtomic, payment.amountAtomic)) dailyAvailable = false;
            if (!_frequencyAvailable(id, grant.limits.maxPaymentsPerWindow)) frequencyAvailable = false;
        }
        if (!originFound) return Reason.OriginChainMissing;
        // A simultaneous frequency breach must not mask the daily-limit pause circuit.
        if (!dailyAvailable || !_dailyAvailable(0, dailyLimitAtomic, payment.amountAtomic)) return Reason.DailyLimit;
        if (!frequencyAvailable || !_frequencyAvailable(0, maxPaymentsPerWindow)) return Reason.FrequencyLimit;
        return Reason.None;
    }

    function _requiresHuman(RuntimePayment memory payment) private view returns (bool) {
        if (payment.origin == Origin.ExternalDocument || payment.amountAtomic > autoApproveThresholdAtomic) {
            return true;
        }
        for (uint256 id = payment.grantId; id != 0; id = delegations[id].parentId) {
            if (payment.amountAtomic > delegations[id].limits.autoApproveThresholdAtomic) return true;
        }
        return false;
    }

    function _dailyAvailable(uint256 id, uint256 limit, uint256 amount) private view returns (bool) {
        DailyUsage storage usage = dailyUsage[id];
        uint256 spent = usage.day == block.timestamp / 1 days ? usage.spentAtomic : 0;
        return spent <= limit && amount <= limit - spent;
    }

    function _frequencyAvailable(uint256 id, uint8 limit) private view returns (bool) {
        Frequency storage usage = frequencies[id];
        return usage.count < limit || block.timestamp >= uint256(usage.timestamps[usage.cursor]) + FREQUENCY_WINDOW;
    }

    function _consume(uint256 id, uint256 amount, uint8 limit) private {
        DailyUsage storage daily = dailyUsage[id];
        uint64 day = uint64(block.timestamp / 1 days);
        if (daily.day != day) {
            daily.day = day;
            daily.spentAtomic = 0;
        }
        daily.spentAtomic += amount;
        Frequency storage usage = frequencies[id];
        usage.timestamps[usage.cursor] = uint64(block.timestamp);
        usage.cursor = uint8((uint256(usage.cursor) + 1) % limit);
        if (usage.count < limit) usage.count++;
    }

    function _execute(bytes32 requestId, RuntimePayment memory payment) private {
        IERC20 asset = IERC20(token);
        uint256 vaultBefore = asset.balanceOf(address(this));
        uint256 recipientBefore = asset.balanceOf(payment.recipient);
        requests[requestId].status = Status.Executed;
        requests[requestId].reason = Reason.None;
        _consume(0, payment.amountAtomic, maxPaymentsPerWindow);
        for (uint256 id = payment.grantId; id != 0; id = delegations[id].parentId) {
            _consume(id, payment.amountAtomic, delegations[id].limits.maxPaymentsPerWindow);
        }
        asset.safeTransfer(payment.recipient, payment.amountAtomic);
        uint256 vaultAfter = asset.balanceOf(address(this));
        uint256 recipientAfter = asset.balanceOf(payment.recipient);
        if (
            vaultAfter > vaultBefore || recipientAfter < recipientBefore
                || vaultBefore - vaultAfter != payment.amountAtomic
                || recipientAfter - recipientBefore != payment.amountAtomic
        ) revert InexactTokenTransfer();
        emit AgentPaymentExecuted(
            requestId,
            payment.grantId,
            delegations[payment.grantId].agent,
            payment.recipient,
            token,
            payment.amountAtomic,
            payment.nonce,
            payment.origin,
            payment.originActor,
            payment.sourceCommitment,
            payment.evidenceCommitment
        );
    }

    function _unauthenticated(bytes32 requestId, Reason reason) private returns (bytes32, Status, Reason) {
        // Replayed/non-agent/invalid-signature traffic cannot consume fresh authority or trip the circuit.
        emit RequestDenied(requestId, msg.sender, reason, false);
        return (requestId, Status.Rejected, reason);
    }

    function _deny(bytes32 requestId, uint256 grantId, Reason reason) private returns (bytes32, Status, Reason) {
        Status status = reason == Reason.Expired ? Status.Expired : Status.Rejected;
        requests[requestId].status = status;
        requests[requestId].reason = reason;
        emit RequestDenied(requestId, msg.sender, reason, true);
        if (status == Status.Expired) emit RequestExpired(requestId);
        if (!paused) {
            address agent = delegations[grantId].agent;
            Refusals storage history = refusals[agent];
            history.timestamps[history.cursor] = uint64(block.timestamp);
            history.cursor = uint8((uint256(history.cursor) + 1) % 3);
            if (history.count < 3) history.count++;
            bool repeated =
                history.count == 3 && block.timestamp < uint256(history.timestamps[history.cursor]) + REFUSAL_WINDOW;
            if (reason == Reason.DailyLimit || repeated) _pause(agent, requestId, reason);
        }
        return (requestId, status, reason);
    }

    /// @notice Monitor privileges only stop payments. This role cannot resume, delegate, approve, or anchor.
    function pause(bytes32 incidentCommitment) external {
        if (msg.sender != monitor && msg.sender != owner) revert UnauthorizedMonitor();
        if (incidentCommitment == bytes32(0)) revert InvalidAnchor();
        _pause(msg.sender, incidentCommitment, Reason.Paused);
    }

    function _pause(address by, bytes32 incidentCommitment, Reason reason) private {
        if (!paused) {
            paused = true;
            emit Paused(by, incidentCommitment, reason);
        }
    }

    function resume() external {
        if (msg.sender != owner) revert UnauthorizedOwner();
        paused = false;
        emit Resumed(msg.sender);
    }

    function anchorBatch(bytes32 anchorId, bytes32 root, uint32 leafCount, bytes32 manifestHash) external {
        _recordAnchor(anchorId, root);
        if (leafCount == 0 || leafCount > 4096 || manifestHash == bytes32(0)) revert InvalidAnchor();
        emit DecisionBatchAnchored(anchorId, root, leafCount, manifestHash);
    }

    function anchorReport(bytes32 anchorId, bytes32 reportHash) external {
        _recordAnchor(anchorId, reportHash);
        emit ReportAnchored(anchorId, reportHash);
    }

    function _recordAnchor(bytes32 anchorId, bytes32 hash) private {
        if (msg.sender != owner && msg.sender != recorder) revert UnauthorizedRecorder();
        if (anchorId == bytes32(0) || hash == bytes32(0) || anchoredHash[anchorId] != bytes32(0)) {
            revert InvalidAnchor();
        }
        anchoredHash[anchorId] = hash;
    }
}
