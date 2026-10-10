// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {AutomationGuard} from "../src/AutomationGuard.sol";
import {DemoToken} from "../src/DemoToken.sol";
import {TestBase, WrongDecimals} from "./PaymentGuard.t.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract AutomationAdversarialToken is ERC20 {
    uint8 public behavior;
    bool public callbackBlocked;
    AutomationGuard public guard;
    constructor() ERC20("Adversarial automation", "BAD") { _mint(msg.sender, 1_000_000e6); }
    function decimals() public pure override returns (uint8) { return 6; }
    function configure(uint8 b, AutomationGuard g) external { behavior = b; guard = g; }
    function transfer(address to, uint256 value) public override returns (bool) {
        if (behavior == 1) return false;
        if (behavior == 2) revert("token revert");
        if (behavior == 3) { _transfer(msg.sender, to, value - 1); return true; }
        if (behavior == 4) {
            try guard.executeRegistered(bytes32(uint256(2)), keccak256("nested")) { revert("reentrancy allowed"); }
            catch (bytes memory reason) { callbackBlocked = reason.length >= 4 && bytes4(reason) == bytes4(keccak256("ReentrancyGuardReentrantCall()")); }
        }
        return super.transfer(to, value);
    }
}

contract AutomationGuardTest is TestBase {
    address internal constant EXECUTOR = address(0xE);
    address internal constant RECIPIENT = address(0xB0B);
    bytes32 internal constant COMMITMENT = keccak256("independent final audit");
    DemoToken internal token;
    AutomationGuard internal guard;
    bytes32[] internal keys;
    address[] internal recipients;

    function setUp() public {
        token = new DemoToken(address(this));
        keys.push(bytes32(uint256(1))); recipients.push(RECIPIENT);
        guard = deploy(address(token), EXECUTOR);
        token.transfer(address(guard), 300_000e6);
    }
    function deploy(address asset, address executor) internal returns (AutomationGuard) {
        return new AutomationGuard(asset, address(this), executor, 50_000e6, 300_000e6, keys, recipients);
    }
    function obligation(uint256 invoice, uint256 value) internal pure returns (AutomationGuard.Obligation memory) {
        return AutomationGuard.Obligation(bytes32(invoice), bytes32(uint256(1)), RECIPIENT, value);
    }
    function single(AutomationGuard.Obligation memory item) internal pure returns (AutomationGuard.Obligation[] memory batch) {
        batch = new AutomationGuard.Obligation[](1); batch[0] = item;
    }
    function execute(AutomationGuard target, uint256 invoice) internal returns (bytes32) {
        vm.prank(EXECUTOR); return target.executeRegistered(bytes32(invoice), COMMITMENT);
    }
    function assertEmpty(AutomationGuard target, uint256 invoice) internal view {
        (,,,bytes32 termsHash) = target.obligations(bytes32(invoice)); eq(termsHash, bytes32(0));
    }
    function testRegistrationDoesNotTransferAndBindsExactTerms() public {
        AutomationGuard.Obligation memory item = obligation(1, 48_000e6);
        guard.registerObligations(single(item));
        (bytes32 supplierKey, address recipient, uint256 amount, bytes32 termsHash) = guard.obligations(item.invoiceKey);
        eq(supplierKey, item.supplierKey); require(recipient == RECIPIENT); eq(amount, 48_000e6);
        eq(termsHash, keccak256(abi.encode(guard.OBLIGATION_TYPEHASH(), block.chainid, address(guard), item.invoiceKey,
            item.supplierKey, RECIPIENT, address(token), item.amountAtomic)));
        eq(guard.totalRegisteredAtomic(), 48_000e6); eq(guard.totalExecutedAtomic(), 0);
        eq(token.balanceOf(address(guard)), 300_000e6); eq(token.balanceOf(RECIPIENT), 0);
    }
    function testExactExecutionConsumesOnceAndCannotReregister() public {
        guard.registerObligations(single(obligation(1, 48_000e6)));
        bytes32 termsHash = execute(guard, 1);
        eq(termsHash, guard.hashObligation(obligation(1, 48_000e6)));
        eq(token.balanceOf(RECIPIENT), 48_000e6); eq(token.balanceOf(address(guard)), 252_000e6);
        eq(guard.totalExecutedAtomic(), 48_000e6); eq(guard.invoiceSettlementCommitment(bytes32(uint256(1))), COMMITMENT);
        vm.expectRevert(AutomationGuard.InvoiceAlreadySettled.selector); execute(guard, 1);
        vm.expectRevert(AutomationGuard.ObligationAlreadyRegistered.selector); guard.registerObligations(single(obligation(1, 1)));
        eq(token.balanceOf(RECIPIENT), 48_000e6);
    }
    function testExecutorCannotRegisterAndOwnerCannotExecute() public {
        AutomationGuard.Obligation[] memory batch = single(obligation(1, 48_000e6));
        vm.expectRevert(AutomationGuard.UnauthorizedRegistration.selector); vm.prank(EXECUTOR); guard.registerObligations(batch);
        vm.expectRevert(AutomationGuard.UnauthorizedRegistration.selector); vm.prank(RECIPIENT); guard.registerObligations(batch);
        guard.registerObligations(batch);
        vm.expectRevert(AutomationGuard.UnauthorizedExecution.selector); guard.executeRegistered(batch[0].invoiceKey, COMMITMENT);
        vm.expectRevert(AutomationGuard.UnauthorizedExecution.selector); vm.prank(RECIPIENT); guard.executeRegistered(batch[0].invoiceKey, COMMITMENT);
        eq(guard.totalExecutedAtomic(), 0);
    }
    function testUnknownObligationAndEmptyCommitmentCannotPay() public {
        vm.expectRevert(AutomationGuard.UnknownObligation.selector); execute(guard, 1);
        guard.registerObligations(single(obligation(1, 1)));
        vm.expectRevert(AutomationGuard.EmptyEvidenceCommitment.selector); vm.prank(EXECUTOR); guard.executeRegistered(bytes32(uint256(1)), bytes32(0));
        eq(guard.totalExecutedAtomic(), 0); eq(token.balanceOf(RECIPIENT), 0);
    }
    function testDuplicateRegistrationCannotReplaceAmountOrRecipient() public {
        guard.registerObligations(single(obligation(1, 48_000e6)));
        AutomationGuard.Obligation memory item = obligation(1, 1); item.recipient = address(0xBAD);
        vm.expectRevert(AutomationGuard.ObligationAlreadyRegistered.selector); guard.registerObligations(single(item));
        execute(guard, 1); eq(token.balanceOf(RECIPIENT), 48_000e6); eq(token.balanceOf(address(0xBAD)), 0);
    }
    function testRegistrationRejectsInvalidTerms() public {
        vm.expectRevert(AutomationGuard.InvalidObligation.selector); guard.registerObligations(single(obligation(0, 1)));
        vm.expectRevert(AutomationGuard.InvalidAmount.selector); guard.registerObligations(single(obligation(1, 0)));
        vm.expectRevert(AutomationGuard.InvalidAmount.selector); guard.registerObligations(single(obligation(1, 50_000e6 + 1)));
        AutomationGuard.Obligation memory item = obligation(1, 1); item.supplierKey = bytes32(uint256(2));
        vm.expectRevert(AutomationGuard.UnknownSupplier.selector); guard.registerObligations(single(item));
        item = obligation(1, 1); item.recipient = address(0xBAD);
        vm.expectRevert(AutomationGuard.WrongRecipient.selector); guard.registerObligations(single(item));
        assertEmpty(guard, 1); eq(guard.totalRegisteredAtomic(), 0);
    }
    function testRegistrationBudgetAndBatchAtomicity() public {
        AutomationGuard.Obligation[] memory batch = new AutomationGuard.Obligation[](7);
        for(uint256 i; i < 7; ++i) batch[i] = obligation(i + 1, 50_000e6);
        vm.expectRevert(AutomationGuard.BudgetExceeded.selector); guard.registerObligations(batch);
        for(uint256 i; i < 7; ++i) assertEmpty(guard, i + 1);
        eq(guard.totalRegisteredAtomic(), 0);
        batch = new AutomationGuard.Obligation[](6);
        for(uint256 i; i < 6; ++i) batch[i] = obligation(i + 1, 50_000e6);
        guard.registerObligations(batch);
        for(uint256 i; i < 6; ++i) execute(guard, i + 1);
        eq(guard.totalExecutedAtomic(), 300_000e6); eq(token.balanceOf(RECIPIENT), 300_000e6);
        vm.expectRevert(AutomationGuard.BudgetExceeded.selector); guard.registerObligations(single(obligation(7, 1)));
    }
    function testDuplicateInBatchRollsBackWholeBatch() public {
        AutomationGuard.Obligation[] memory batch = new AutomationGuard.Obligation[](2);
        batch[0] = obligation(1, 1); batch[1] = obligation(1, 2);
        vm.expectRevert(AutomationGuard.ObligationAlreadyRegistered.selector); guard.registerObligations(batch);
        assertEmpty(guard, 1); eq(guard.totalRegisteredAtomic(), 0);
    }
    function testBatchSizeBounds() public {
        vm.expectRevert(AutomationGuard.InvalidObligation.selector); guard.registerObligations(new AutomationGuard.Obligation[](0));
        vm.expectRevert(AutomationGuard.InvalidObligation.selector); guard.registerObligations(new AutomationGuard.Obligation[](33));
    }
    function testTransferFailuresRollbackCommitmentAndBudget() public {
        for(uint8 mode = 1; mode <= 3; ++mode) {
            AutomationAdversarialToken bad = new AutomationAdversarialToken(); AutomationGuard target = deploy(address(bad), EXECUTOR);
            bad.transfer(address(target), 300_000e6); target.registerObligations(single(obligation(1, 48_000e6))); bad.configure(mode, target);
            vm.expectRevert(); execute(target, 1);
            eq(target.invoiceSettlementCommitment(bytes32(uint256(1))), bytes32(0)); eq(target.totalExecutedAtomic(), 0);
            eq(target.totalRegisteredAtomic(), 48_000e6); eq(bad.balanceOf(address(target)), 300_000e6); eq(bad.balanceOf(RECIPIENT), 0);
        }
    }
    function testInsufficientLiquidityPreservesAuthorityForRetry() public {
        AutomationGuard empty = deploy(address(token), EXECUTOR); empty.registerObligations(single(obligation(1, 48_000e6)));
        vm.expectRevert(); execute(empty, 1); eq(empty.invoiceSettlementCommitment(bytes32(uint256(1))), bytes32(0)); eq(empty.totalExecutedAtomic(), 0);
        token.transfer(address(empty), 48_000e6); execute(empty, 1); eq(token.balanceOf(RECIPIENT), 48_000e6);
    }
    function testReentrantTokenCallbackBlocked() public {
        AutomationAdversarialToken bad = new AutomationAdversarialToken(); AutomationGuard target = deploy(address(bad), address(bad));
        bad.transfer(address(target), 300_000e6);
        AutomationGuard.Obligation[] memory batch = new AutomationGuard.Obligation[](2); batch[0] = obligation(1, 48_000e6); batch[1] = obligation(2, 48_000e6);
        target.registerObligations(batch); bad.configure(4, target);
        vm.prank(address(bad)); target.executeRegistered(bytes32(uint256(1)), COMMITMENT);
        require(bad.callbackBlocked(), "callback not blocked"); eq(target.invoiceSettlementCommitment(bytes32(uint256(2))), bytes32(0));
        eq(target.totalExecutedAtomic(), 48_000e6); eq(bad.balanceOf(RECIPIENT), 48_000e6);
    }
    function testConstructorRejectsUnsafeRolesTokenAndCaps() public {
        vm.expectRevert(AutomationGuard.InvalidConfiguration.selector); deploy(address(0), EXECUTOR);
        vm.expectRevert(AutomationGuard.InvalidConfiguration.selector); deploy(address(0xABC), EXECUTOR);
        vm.expectRevert(AutomationGuard.InvalidConfiguration.selector); deploy(address(token), address(0));
        vm.expectRevert(AutomationGuard.InvalidConfiguration.selector); deploy(address(token), address(this));
        vm.expectRevert(AutomationGuard.InvalidConfiguration.selector); new AutomationGuard(address(token), address(0), EXECUTOR, 1, 1, keys, recipients);
        vm.expectRevert(AutomationGuard.InvalidConfiguration.selector); new AutomationGuard(address(token), address(this), EXECUTOR, 0, 1, keys, recipients);
        vm.expectRevert(AutomationGuard.InvalidConfiguration.selector); new AutomationGuard(address(token), address(this), EXECUTOR, 2, 1, keys, recipients);
        WrongDecimals bad = new WrongDecimals(); vm.expectRevert(AutomationGuard.InvalidConfiguration.selector); deploy(address(bad), EXECUTOR);
    }
    function testConstructorRejectsUnsafeRegistry() public {
        address[] memory r = new address[](1); r[0] = address(0);
        vm.expectRevert(AutomationGuard.InvalidRegistry.selector); new AutomationGuard(address(token), address(this), EXECUTOR, 1, 1, keys, r);
        r[0] = EXECUTOR; vm.expectRevert(AutomationGuard.InvalidRegistry.selector); new AutomationGuard(address(token), address(this), EXECUTOR, 1, 1, keys, r);
        r[0] = address(this); vm.expectRevert(AutomationGuard.InvalidRegistry.selector); new AutomationGuard(address(token), address(this), EXECUTOR, 1, 1, keys, r);
        r[0] = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        vm.expectRevert(AutomationGuard.InvalidRegistry.selector); new AutomationGuard(address(token), address(this), EXECUTOR, 1, 1, keys, r);
        bytes32[] memory k = new bytes32[](1); r[0] = RECIPIENT;
        vm.expectRevert(AutomationGuard.InvalidRegistry.selector); new AutomationGuard(address(token), address(this), EXECUTOR, 1, 1, k, r);
        k = new bytes32[](2); r = new address[](2); k[0] = bytes32(uint256(2)); k[1] = bytes32(uint256(1)); r[0] = RECIPIENT; r[1] = address(0xC);
        vm.expectRevert(AutomationGuard.InvalidRegistry.selector); new AutomationGuard(address(token), address(this), EXECUTOR, 1, 1, k, r);
        k[0] = k[1]; vm.expectRevert(AutomationGuard.InvalidRegistry.selector); new AutomationGuard(address(token), address(this), EXECUTOR, 1, 1, k, r);
        vm.expectRevert(AutomationGuard.InvalidRegistry.selector); new AutomationGuard(address(token), address(this), EXECUTOR, 1, 1, new bytes32[](0), new address[](0));
        vm.expectRevert(AutomationGuard.InvalidRegistry.selector); new AutomationGuard(address(token), address(this), EXECUTOR, 1, 1, new bytes32[](33), new address[](33));
    }
    function testFuzzRegisteredAmountIsExactAndCannotRepeat(uint256 candidate) public {
        uint256 value = candidate % 50_000e6 + 1;
        guard.registerObligations(single(obligation(1, value))); execute(guard, 1);
        eq(token.balanceOf(RECIPIENT), value); eq(token.balanceOf(address(guard)), 300_000e6 - value);
        eq(guard.totalRegisteredAtomic(), value); eq(guard.totalExecutedAtomic(), value);
        vm.expectRevert(AutomationGuard.InvoiceAlreadySettled.selector); execute(guard, 1);
    }
}
