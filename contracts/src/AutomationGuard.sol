// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Standing authority for exact, owner-reviewed obligations. An executor cannot choose payment terms.
/// @dev Separate from PaymentGuard: intended for the isolated synthetic demo, with no upgrade or withdrawal route.
contract AutomationGuard is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Obligation { bytes32 invoiceKey; bytes32 supplierKey; address recipient; uint256 amountAtomic; }
    struct RegisteredObligation { bytes32 supplierKey; address recipient; uint256 amountAtomic; bytes32 termsHash; }

    error InvalidConfiguration();
    error InvalidRegistry();
    error UnauthorizedRegistration();
    error UnauthorizedExecution();
    error InvalidObligation();
    error UnknownSupplier();
    error WrongRecipient();
    error InvalidAmount();
    error ObligationAlreadyRegistered();
    error BudgetExceeded();
    error UnknownObligation();
    error EmptyEvidenceCommitment();
    error InvoiceAlreadySettled();
    error InexactTokenTransfer();

    bytes32 public constant OBLIGATION_TYPEHASH = keccak256("AutomationObligationV1(uint256 chainId,address guard,bytes32 invoiceKey,bytes32 supplierKey,address recipient,address token,uint256 amountAtomic)");
    address public immutable token;
    address public immutable policyOwner;
    address public immutable executor;
    uint256 public immutable maxPerPaymentAtomic;
    uint256 public immutable totalBudgetAtomic;
    bytes32 public immutable registryHash;
    uint256 public totalRegisteredAtomic;
    uint256 public totalExecutedAtomic;
    mapping(bytes32 supplierKey => address recipient) public supplierRecipient;
    mapping(bytes32 invoiceKey => RegisteredObligation obligation) public obligations;
    mapping(bytes32 invoiceKey => bytes32 evidenceCommitment) public invoiceSettlementCommitment;

    event AutomationPolicyInitialized(address indexed token, address indexed policyOwner, address indexed executor,
        uint256 maxPerPaymentAtomic, uint256 totalBudgetAtomic, bytes32 registryHash);
    event ObligationRegistered(bytes32 indexed invoiceKey, bytes32 indexed termsHash, bytes32 supplierKey,
        address recipient, uint256 amountAtomic);
    event AutomationPaymentExecuted(bytes32 indexed invoiceKey, bytes32 indexed termsHash, bytes32 supplierKey,
        address recipient, address token, uint256 amountAtomic, bytes32 evidenceCommitment);

    constructor(address token_, address policyOwner_, address executor_, uint256 maxPerPaymentAtomic_,
        uint256 totalBudgetAtomic_, bytes32[] memory supplierKeys_, address[] memory recipients_) {
        if (token_.code.length == 0 || policyOwner_ == address(0) || executor_ == address(0) ||
            policyOwner_ == executor_ || maxPerPaymentAtomic_ == 0 || totalBudgetAtomic_ < maxPerPaymentAtomic_) revert InvalidConfiguration();
        try IERC20Metadata(token_).decimals() returns (uint8 decimalCount) {
            if (decimalCount != 6) revert InvalidConfiguration();
        } catch { revert InvalidConfiguration(); }
        uint256 count = supplierKeys_.length;
        if (count == 0 || count > 32 || recipients_.length != count) revert InvalidRegistry();
        bytes32 previous;
        for (uint256 i; i < count; ++i) {
            if (supplierKeys_[i] <= previous || recipients_[i] == address(0) || recipients_[i] == address(this) ||
                recipients_[i] == policyOwner_ || recipients_[i] == executor_) revert InvalidRegistry();
            previous = supplierKeys_[i]; supplierRecipient[supplierKeys_[i]] = recipients_[i];
        }
        token = token_; policyOwner = policyOwner_; executor = executor_;
        maxPerPaymentAtomic = maxPerPaymentAtomic_; totalBudgetAtomic = totalBudgetAtomic_;
        registryHash = keccak256(abi.encode(supplierKeys_, recipients_));
        emit AutomationPolicyInitialized(token_, policyOwner_, executor_, maxPerPaymentAtomic_, totalBudgetAtomic_, registryHash);
    }

    function hashObligation(Obligation calldata obligation) public view returns (bytes32) {
        return keccak256(abi.encode(OBLIGATION_TYPEHASH, block.chainid, address(this), obligation.invoiceKey,
            obligation.supplierKey, obligation.recipient, token, obligation.amountAtomic));
    }

    /// @notice Registration itself grants payment authority for these exact obligations, once each.
    function registerObligations(Obligation[] calldata batch) external {
        if (msg.sender != policyOwner) revert UnauthorizedRegistration();
        if (batch.length == 0 || batch.length > 32) revert InvalidObligation();
        uint256 registered = totalRegisteredAtomic;
        for (uint256 i; i < batch.length; ++i) {
            Obligation calldata obligation = batch[i];
            if (obligation.invoiceKey == bytes32(0)) revert InvalidObligation();
            if (obligations[obligation.invoiceKey].termsHash != bytes32(0)) revert ObligationAlreadyRegistered();
            address recipient = supplierRecipient[obligation.supplierKey];
            if (recipient == address(0)) revert UnknownSupplier();
            if (recipient != obligation.recipient) revert WrongRecipient();
            if (obligation.amountAtomic == 0 || obligation.amountAtomic > maxPerPaymentAtomic) revert InvalidAmount();
            if (obligation.amountAtomic > totalBudgetAtomic - registered) revert BudgetExceeded();
            registered += obligation.amountAtomic;
            bytes32 termsHash = hashObligation(obligation);
            obligations[obligation.invoiceKey] = RegisteredObligation(obligation.supplierKey, recipient, obligation.amountAtomic, termsHash);
            emit ObligationRegistered(obligation.invoiceKey, termsHash, obligation.supplierKey, recipient, obligation.amountAtomic);
        }
        totalRegisteredAtomic = registered;
    }

    /// @notice Only the immutable executor may consume prior authority; no new amount or destination is accepted.
    /// @dev The commitment anchors the application's independent audit; this contract cannot verify its business truth.
    function executeRegistered(bytes32 invoiceKey, bytes32 evidenceCommitment) external nonReentrant returns (bytes32 termsHash) {
        if (msg.sender != executor) revert UnauthorizedExecution();
        if (evidenceCommitment == bytes32(0)) revert EmptyEvidenceCommitment();
        RegisteredObligation memory obligation = obligations[invoiceKey];
        termsHash = obligation.termsHash;
        if (termsHash == bytes32(0)) revert UnknownObligation();
        if (invoiceSettlementCommitment[invoiceKey] != bytes32(0)) revert InvoiceAlreadySettled();
        if (obligation.amountAtomic > totalBudgetAtomic - totalExecutedAtomic) revert BudgetExceeded();
        IERC20 asset = IERC20(token);
        uint256 vaultBefore = asset.balanceOf(address(this));
        uint256 recipientBefore = asset.balanceOf(obligation.recipient);
        invoiceSettlementCommitment[invoiceKey] = evidenceCommitment;
        totalExecutedAtomic += obligation.amountAtomic;
        asset.safeTransfer(obligation.recipient, obligation.amountAtomic);
        uint256 vaultAfter = asset.balanceOf(address(this));
        uint256 recipientAfter = asset.balanceOf(obligation.recipient);
        if (vaultAfter > vaultBefore || recipientAfter < recipientBefore || vaultBefore - vaultAfter != obligation.amountAtomic ||
            recipientAfter - recipientBefore != obligation.amountAtomic) revert InexactTokenTransfer();
        emit AutomationPaymentExecuted(invoiceKey, termsHash, obligation.supplierKey, obligation.recipient,
            token, obligation.amountAtomic, evidenceCommitment);
    }
}
