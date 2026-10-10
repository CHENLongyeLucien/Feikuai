// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Fixed-policy, one-token payment vault. No owner, upgrades, allowances or escape transfer route.
contract PaymentGuard is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Payment {
        bytes32 invoiceKey;
        bytes32 supplierKey;
        address recipient;
        address token;
        uint256 amountAtomic;
        uint256 authorizationNonce;
        uint64 issuedAt;
        uint64 deadline;
        bytes32 evidenceCommitment;
        bytes32 policyId;
    }

    enum NonceState { Unused, Executed, Cancelled }

    error InvalidConfiguration();
    error InvalidRegistry();
    error MalformedPayment();
    error InvalidApproval();
    error WrongPolicy();
    error WrongToken();
    error UnknownSupplier();
    error WrongRecipient();
    error InvalidAmount();
    error InvalidTimeWindow();
    error FutureIssuance();
    error ApprovalExpired();
    error NonceUnavailable();
    error InvoiceAlreadySettled();
    error UnauthorizedCancellation();
    error InexactTokenTransfer();

    bytes32 public constant PAYMENT_TYPEHASH = keccak256("Payment(bytes32 invoiceKey,bytes32 supplierKey,address recipient,address token,uint256 amountAtomic,uint256 authorizationNonce,uint64 issuedAt,uint64 deadline,bytes32 evidenceCommitment,bytes32 policyId)");
    bytes32 public constant POLICY_TYPEHASH = keccak256("SecureFinancePolicyV1(address token,address approver,uint256 maxPerPaymentAtomic,uint64 maxAuthorizationTTL,bytes32 registryHash,bytes32 paymentTypeHash)");

    address public immutable token;
    address public immutable approver;
    uint256 public immutable maxPerPaymentAtomic;
    uint64 public immutable maxAuthorizationTTL;
    bytes32 public immutable registryHash;
    bytes32 public immutable policyId;
    mapping(bytes32 supplierKey => address recipient) public supplierRecipient;
    mapping(uint256 authorizationNonce => NonceState state) public nonceState;
    mapping(bytes32 invoiceKey => bytes32 digest) public invoiceSettlementDigest;

    event PaymentExecuted(bytes32 indexed invoiceKey, uint256 indexed authorizationNonce, bytes32 indexed digest,
        bytes32 supplierKey, address recipient, address token, uint256 amountAtomic, bytes32 evidenceCommitment, bytes32 policyId);
    event NonceCancelled(uint256 indexed authorizationNonce, address indexed approver);
    event PolicyInitialized(bytes32 indexed policyId, address indexed token, address indexed approver,
        uint256 maxPerPaymentAtomic, uint64 maxAuthorizationTTL, bytes32 registryHash);

    constructor(address token_, address approver_, uint256 maxPerPaymentAtomic_, uint64 maxAuthorizationTTL_,
        bytes32[] memory supplierKeys_, address[] memory recipients_) EIP712("SecureFinancePaymentGuard", "1") {
        if (token_ == address(0) || approver_ == address(0) || token_.code.length == 0 ||
            maxPerPaymentAtomic_ == 0 || maxAuthorizationTTL_ == 0 || maxAuthorizationTTL_ > 600) revert InvalidConfiguration();
        try IERC20Metadata(token_).decimals() returns (uint8 decimalCount) {
            if (decimalCount != 6) revert InvalidConfiguration();
        } catch { revert InvalidConfiguration(); }
        uint256 count = supplierKeys_.length;
        if (count == 0 || count > 32 || recipients_.length != count) revert InvalidRegistry();
        bytes32 previous;
        for (uint256 i; i < count; ++i) {
            if (supplierKeys_[i] <= previous || recipients_[i] == address(0) || recipients_[i] == address(this)) revert InvalidRegistry();
            previous = supplierKeys_[i];
            supplierRecipient[supplierKeys_[i]] = recipients_[i];
        }
        token = token_;
        approver = approver_;
        maxPerPaymentAtomic = maxPerPaymentAtomic_;
        maxAuthorizationTTL = maxAuthorizationTTL_;
        registryHash = keccak256(abi.encode(supplierKeys_, recipients_));
        policyId = keccak256(abi.encode(POLICY_TYPEHASH, token_, approver_, maxPerPaymentAtomic_,
            maxAuthorizationTTL_, registryHash, PAYMENT_TYPEHASH));
        emit PolicyInitialized(policyId, token_, approver_, maxPerPaymentAtomic_, maxAuthorizationTTL_, registryHash);
    }

    function hashPayment(Payment calldata payment) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(PAYMENT_TYPEHASH, payment.invoiceKey, payment.supplierKey,
            payment.recipient, payment.token, payment.amountAtomic, payment.authorizationNonce, payment.issuedAt,
            payment.deadline, payment.evidenceCommitment, payment.policyId)));
    }

    function executePayment(Payment calldata payment, bytes calldata signature) external nonReentrant returns (bytes32 digest) {
        if (payment.invoiceKey == bytes32(0) || payment.authorizationNonce == 0 || payment.evidenceCommitment == bytes32(0)) revert MalformedPayment();
        digest = hashPayment(payment);
        if (signature.length != 65) revert InvalidApproval();
        (address recovered, ECDSA.RecoverError error,) = ECDSA.tryRecover(digest, signature);
        if (error != ECDSA.RecoverError.NoError || recovered != approver) revert InvalidApproval();
        if (payment.policyId != policyId) revert WrongPolicy();
        if (payment.token != token) revert WrongToken();
        address recipient = supplierRecipient[payment.supplierKey];
        if (recipient == address(0)) revert UnknownSupplier();
        if (payment.recipient != recipient) revert WrongRecipient();
        if (payment.amountAtomic == 0 || payment.amountAtomic > maxPerPaymentAtomic) revert InvalidAmount();
        if (payment.deadline <= payment.issuedAt || payment.deadline - payment.issuedAt > maxAuthorizationTTL) revert InvalidTimeWindow();
        if (payment.issuedAt > block.timestamp) revert FutureIssuance();
        if (block.timestamp >= payment.deadline) revert ApprovalExpired();
        if (nonceState[payment.authorizationNonce] != NonceState.Unused) revert NonceUnavailable();
        if (invoiceSettlementDigest[payment.invoiceKey] != bytes32(0)) revert InvoiceAlreadySettled();
        IERC20 asset = IERC20(token);
        uint256 vaultBefore = asset.balanceOf(address(this));
        uint256 recipientBefore = asset.balanceOf(recipient);
        nonceState[payment.authorizationNonce] = NonceState.Executed;
        invoiceSettlementDigest[payment.invoiceKey] = digest;
        asset.safeTransfer(recipient, payment.amountAtomic);
        uint256 vaultAfter = asset.balanceOf(address(this));
        uint256 recipientAfter = asset.balanceOf(recipient);
        if (vaultAfter > vaultBefore || recipientAfter < recipientBefore ||
            vaultBefore - vaultAfter != payment.amountAtomic || recipientAfter - recipientBefore != payment.amountAtomic) revert InexactTokenTransfer();
        emit PaymentExecuted(payment.invoiceKey, payment.authorizationNonce, digest, payment.supplierKey, recipient,
            token, payment.amountAtomic, payment.evidenceCommitment, policyId);
    }

    function cancelNonce(uint256 authorizationNonce) external {
        if (msg.sender != approver) revert UnauthorizedCancellation();
        if (authorizationNonce == 0) revert MalformedPayment();
        if (nonceState[authorizationNonce] != NonceState.Unused) revert NonceUnavailable();
        nonceState[authorizationNonce] = NonceState.Cancelled;
        emit NonceCancelled(authorizationNonce, approver);
    }
}
