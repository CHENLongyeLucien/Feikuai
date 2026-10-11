// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {AgentGuard} from "../src/AgentGuard.sol";
import {DemoToken} from "../src/DemoToken.sol";
import {TestBase, WrongDecimals} from "./PaymentGuard.t.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface AgentLogVm {
    struct Log {
        bytes32[] topics;
        bytes data;
        address emitter;
    }
    function recordLogs() external;
    function getRecordedLogs() external returns (Log[] memory);
}

contract AgentAdversarialToken is ERC20 {
    uint8 public behavior;
    AgentGuard public guard;
    AgentGuard.RuntimePayment private nested;
    bytes private signature;
    bool public callbackBlocked;

    constructor() ERC20("Adversarial Agent Token", "BAD") {
        _mint(msg.sender, 1_000_000e6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function configure(uint8 mode, AgentGuard target, AgentGuard.RuntimePayment memory payment, bytes memory sig)
        external
    {
        behavior = mode;
        guard = target;
        nested = payment;
        signature = sig;
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        if (behavior == 1) return false;
        if (behavior == 2) revert("transfer failure");
        if (behavior == 3) {
            _transfer(msg.sender, recipient, amount - 1);
            return true;
        }
        if (behavior == 4) {
            try guard.submitRequest(nested, signature) {
                revert("reentrancy allowed");
            } catch (bytes memory reason) {
                callbackBlocked =
                    reason.length >= 4 && bytes4(reason) == bytes4(keccak256("ReentrancyGuardReentrantCall()"));
            }
        }
        return super.transfer(recipient, amount);
    }
}

contract AgentGuardTest is TestBase {
    AgentLogVm internal constant logsVm = AgentLogVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 internal constant ATTESTOR_KEY = 0xA77E57;
    address internal constant AGENT = address(0xA1);
    address internal constant CHILD = address(0xA2);
    address internal constant OTHER_CHILD = address(0xA3);
    address internal constant MONITOR = address(0xF00);
    address internal constant RECORDER = address(0xFEE);
    address internal constant RECIPIENT = address(0xBEEF);
    address internal constant SECOND_RECIPIENT = address(0xCAFE);
    DemoToken internal token;
    AgentGuard internal guard;
    address[] internal recipients;
    uint256 internal root;

    function setUp() public {
        vm.warp(1_800_000_000);
        token = new DemoToken(address(this));
        recipients.push(RECIPIENT);
        recipients.push(SECOND_RECIPIENT);
        guard = deploy(address(token), 8);
        token.transfer(address(guard), 1_000e6);
        root = guard.registerDelegation(0, AGENT, limits(), recipients);
    }

    function deploy(address asset, uint8 frequency) internal returns (AgentGuard) {
        return new AgentGuard(
            asset, address(this), vm.addr(ATTESTOR_KEY), MONITOR, RECORDER, 100e6, 300e6, 50e6, frequency, recipients
        );
    }

    function limits() internal view returns (AgentGuard.Limits memory) {
        return AgentGuard.Limits(100e6, 300e6, 50e6, uint64(block.timestamp), uint64(block.timestamp + 2 days), 8, true);
    }

    function request(uint256 grantId, uint256 nonce, uint256 amount)
        internal
        view
        returns (AgentGuard.RuntimePayment memory)
    {
        return AgentGuard.RuntimePayment(
            grantId,
            RECIPIENT,
            address(token),
            amount,
            nonce,
            uint64(block.timestamp),
            uint64(block.timestamp + 600),
            AgentGuard.Origin.Human,
            address(this),
            keccak256("source"),
            keccak256("evidence")
        );
    }

    function runtimeSign(AgentGuard target, AgentGuard.RuntimePayment memory payment) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTESTOR_KEY, target.hashRequest(payment));
        return abi.encodePacked(r, s, v);
    }

    function submit(AgentGuard target, AgentGuard.RuntimePayment memory payment)
        internal
        returns (bytes32, AgentGuard.Status, AgentGuard.Reason)
    {
        bytes memory signature = runtimeSign(target, payment);
        address agent = target.getDelegation(payment.grantId).agent;
        vm.prank(agent);
        return target.submitRequest(payment, signature);
    }

    function executed(AgentGuard target, AgentGuard.RuntimePayment memory payment) internal returns (bytes32 id) {
        AgentGuard.Status status;
        AgentGuard.Reason reason;
        (id, status, reason) = submit(target, payment);
        eq(uint256(status), uint256(AgentGuard.Status.Executed));
        eq(uint256(reason), 0);
    }

    function denied(AgentGuard target, AgentGuard.RuntimePayment memory payment, AgentGuard.Reason expected)
        internal
        returns (bytes32 id)
    {
        AgentGuard.Status status;
        AgentGuard.Reason reason;
        (id, status, reason) = submit(target, payment);
        eq(
            uint256(status),
            uint256(expected == AgentGuard.Reason.Expired ? AgentGuard.Status.Expired : AgentGuard.Status.Rejected)
        );
        eq(uint256(reason), uint256(expected));
    }

    function spent(AgentGuard target, uint256 id) internal view returns (uint256 value) {
        (, value) = target.dailyUsage(id);
    }

    function child(uint256 parent, address agent, AgentGuard.Limits memory policy) internal returns (uint256 id) {
        address issuer = guard.getDelegation(parent).agent;
        vm.prank(issuer);
        return guard.registerDelegation(parent, agent, policy, recipients);
    }

    function pending(AgentGuard.RuntimePayment memory payment) internal returns (bytes32 id) {
        AgentGuard.Status status;
        AgentGuard.Reason reason;
        (id, status, reason) = submit(guard, payment);
        eq(uint256(status), uint256(AgentGuard.Status.Pending));
        eq(uint256(reason), uint256(AgentGuard.Reason.HumanApprovalRequired));
    }

    function testAutomaticPaymentBindsReceiptEvidenceAndConsumesOnce() public {
        AgentGuard.RuntimePayment memory payment = request(root, 1, 10e6);
        logsVm.recordLogs();
        bytes32 id = executed(guard, payment);
        AgentLogVm.Log[] memory entries = logsVm.getRecordedLogs();
        bool found;
        bytes32 eventHash = keccak256(
            "AgentPaymentExecuted(bytes32,uint256,address,address,address,uint256,uint256,uint8,address,bytes32,bytes32)"
        );
        for (uint256 i; i < entries.length; ++i) {
            if (entries[i].emitter == address(guard) && entries[i].topics[0] == eventHash) {
                found = true;
                eq(entries[i].topics[1], id);
                eq(entries[i].topics[2], bytes32(root));
                (
                    address recipient,
                    address asset,
                    uint256 amount,
                    uint256 nonce,
                    AgentGuard.Origin origin,
                    address actor,
                    bytes32 source,
                    bytes32 evidence
                ) = abi.decode(
                    entries[i].data, (address, address, uint256, uint256, AgentGuard.Origin, address, bytes32, bytes32)
                );
                require(recipient == RECIPIENT && asset == address(token) && actor == address(this));
                eq(amount, 10e6);
                eq(nonce, 1);
                eq(uint256(origin), 0);
                eq(source, payment.sourceCommitment);
                eq(evidence, payment.evidenceCommitment);
            }
        }
        require(found, "missing execution event");
        eq(token.balanceOf(RECIPIENT), 10e6);
        eq(spent(guard, 0), 10e6);
        eq(spent(guard, root), 10e6);
        require(guard.nonceUsed(AGENT, 1));
        denied(guard, payment, AgentGuard.Reason.NonceUnavailable);
        eq(uint256(guard.getRequest(id).status), uint256(AgentGuard.Status.Executed));
        eq(token.balanceOf(RECIPIENT), 10e6);
        payment.amountAtomic = 11e6;
        denied(guard, payment, AgentGuard.Reason.NonceUnavailable);
    }

    function testEveryAttestedFieldIsBoundAndUnsignedTrafficCannotTripCircuit() public {
        uint256 alternate = guard.registerDelegation(0, AGENT, limits(), recipients);
        for (uint256 i; i < 12; ++i) {
            AgentGuard.RuntimePayment memory payment = request(root, 1, 10e6);
            bytes memory signature = runtimeSign(guard, payment);
            if (i == 0) payment.grantId = alternate;
            if (i == 1) payment.recipient = SECOND_RECIPIENT;
            if (i == 2) payment.token = address(0xBAD);
            if (i == 3) payment.amountAtomic++;
            if (i == 4) payment.nonce++;
            if (i == 5) payment.issuedAt--;
            if (i == 6) payment.deadline--;
            if (i == 7) payment.origin = AgentGuard.Origin.ExternalDocument;
            if (i == 8) payment.originActor = CHILD;
            if (i == 9) payment.sourceCommitment = keccak256("tampered source");
            if (i == 10) payment.evidenceCommitment = keccak256("tampered evidence");
            if (i == 11) signature = new bytes(64);
            vm.prank(AGENT);
            (,, AgentGuard.Reason reason) = guard.submitRequest(payment, signature);
            eq(uint256(reason), uint256(AgentGuard.Reason.InvalidRuntimeSignature));
        }
        require(!guard.paused() && !guard.nonceUsed(AGENT, 1));
        eq(token.balanceOf(RECIPIENT), 0);
    }

    function testRuntimeAttestationCannotReplayAcrossChainOrVault() public {
        AgentGuard.RuntimePayment memory payment = request(root, 1, 10e6);
        bytes memory signature = runtimeSign(guard, payment);
        uint256 chain = block.chainid;
        vm.chainId(chain + 1);
        vm.prank(AGENT);
        (,, AgentGuard.Reason reason) = guard.submitRequest(payment, signature);
        eq(uint256(reason), uint256(AgentGuard.Reason.InvalidRuntimeSignature));
        vm.chainId(chain);
        AgentGuard other = deploy(address(token), 8);
        other.registerDelegation(0, AGENT, limits(), recipients);
        vm.prank(AGENT);
        (,, reason) = other.submitRequest(payment, signature);
        eq(uint256(reason), uint256(AgentGuard.Reason.InvalidRuntimeSignature));
    }

    function testUnregisteredResearchAgentCannotCallOrForgeAnAuthorityLink() public {
        AgentGuard.RuntimePayment memory payment = request(root, 1, 10e6);
        bytes memory signature = runtimeSign(guard, payment);
        vm.prank(address(0xBAD));
        (,, AgentGuard.Reason reason) = guard.submitRequest(payment, signature);
        eq(uint256(reason), uint256(AgentGuard.Reason.UnauthorizedAgent));
        require(!guard.nonceUsed(AGENT, 1));
        AgentGuard.Limits memory policy = limits();
        vm.expectRevert(AgentGuard.UnauthorizedDelegation.selector);
        vm.prank(address(0xBAD));
        guard.registerDelegation(0, CHILD, policy, recipients);
        payment.grantId = 999;
        signature = runtimeSign(guard, payment);
        vm.prank(AGENT);
        (,, reason) = guard.submitRequest(payment, signature);
        eq(uint256(reason), uint256(AgentGuard.Reason.UnknownGrant));
        eq(token.balanceOf(RECIPIENT), 0);
    }

    function testAttestedResearchOriginCannotBeOmittedFromRegisteredChain() public {
        AgentGuard.RuntimePayment memory payment = request(root, 1, 10e6);
        payment.origin = AgentGuard.Origin.Agent;
        payment.originActor = address(0xBAD);
        denied(guard, payment, AgentGuard.Reason.OriginChainMissing);
        eq(token.balanceOf(RECIPIENT), 0);
        require(guard.nonceUsed(AGENT, 1));
        uint256 leaf = child(root, CHILD, limits());
        payment = request(leaf, 2, 10e6);
        payment.origin = AgentGuard.Origin.Agent;
        payment.originActor = AGENT;
        executed(guard, payment);
        eq(spent(guard, root), 10e6);
        eq(spent(guard, leaf), 10e6);
    }

    function testTrustBoundaryDishonestAuthenticatedOriginIsNotDetectableOnchain() public {
        // This test deliberately demonstrates a limitation, not an injection-prevention guarantee:
        // a compromised attestor can label hidden document influence as Human, within standing limits.
        AgentGuard.RuntimePayment memory payment = request(root, 1, 10e6);
        payment.sourceCommitment = keccak256("external document falsely described by compromised runtime");
        executed(guard, payment);
        eq(token.balanceOf(RECIPIENT), 10e6);
        payment = request(root, 2, 10e6);
        payment.recipient = address(0xBAD);
        denied(guard, payment, AgentGuard.Reason.RecipientNotAllowed);
        eq(token.balanceOf(address(0xBAD)), 0);
    }

    function testAncestorRevocationAndExpiryRemainMandatory() public {
        uint256 leaf = child(root, CHILD, limits());
        guard.revokeDelegation(root);
        denied(guard, request(leaf, 1, 1), AgentGuard.Reason.Revoked);
        AgentGuard.Limits memory policy = limits();
        uint256 second = guard.registerDelegation(0, OTHER_CHILD, policy, recipients);
        vm.warp(policy.expiresAt);
        denied(guard, request(second, 2, 1), AgentGuard.Reason.InactiveGrant);
        eq(token.balanceOf(RECIPIENT), 0);
    }

    function testDelegationAttenuationRecipientsAndDepthAreEnforced() public {
        AgentGuard.Limits memory policy = limits();
        policy.dailyLimitAtomic = 301e6;
        vm.expectRevert(AgentGuard.InvalidDelegation.selector);
        vm.prank(AGENT);
        guard.registerDelegation(root, CHILD, policy, recipients);
        policy = limits();
        policy.expiresAt++;
        vm.expectRevert(AgentGuard.InvalidDelegation.selector);
        vm.prank(AGENT);
        guard.registerDelegation(root, CHILD, policy, recipients);
        policy = limits();
        uint256 parent = root;
        for (uint256 i = 2; i <= 8; ++i) {
            parent = child(parent, address(uint160(0x100 + i)), policy);
        }
        eq(guard.getDelegation(parent).depth, 8);
        address issuer = guard.getDelegation(parent).agent;
        vm.expectRevert(AgentGuard.InvalidDelegation.selector);
        vm.prank(issuer);
        guard.registerDelegation(parent, CHILD, policy, recipients);
        policy.canDelegate = false;
        uint256 closed = guard.registerDelegation(0, OTHER_CHILD, policy, recipients);
        vm.expectRevert(AgentGuard.UnauthorizedDelegation.selector);
        vm.prank(OTHER_CHILD);
        guard.registerDelegation(closed, CHILD, policy, recipients);
        address[] memory narrow = new address[](1);
        narrow[0] = RECIPIENT;
        policy = limits();
        uint256 limited = guard.registerDelegation(0, OTHER_CHILD, policy, narrow);
        vm.expectRevert(AgentGuard.InvalidDelegation.selector);
        vm.prank(OTHER_CHILD);
        guard.registerDelegation(limited, CHILD, policy, recipients);
        AgentGuard.RuntimePayment memory payment = request(limited, 1, 1);
        payment.recipient = SECOND_RECIPIENT;
        denied(guard, payment, AgentGuard.Reason.RecipientNotAllowed);
    }

    function testSiblingDelegationsShareAncestorDailyBudget() public {
        AgentGuard.Limits memory policy = limits();
        policy.dailyLimitAtomic = 100e6;
        uint256 parent = guard.registerDelegation(0, OTHER_CHILD, policy, recipients);
        uint256 a = child(parent, address(0x101), policy);
        uint256 b = child(parent, address(0x102), policy);
        executed(guard, request(a, 1, 50e6));
        executed(guard, request(b, 1, 50e6));
        denied(guard, request(a, 2, 1), AgentGuard.Reason.DailyLimit);
        eq(spent(guard, parent), 100e6);
        eq(spent(guard, a), 50e6);
        eq(spent(guard, b), 50e6);
        require(guard.paused());
    }

    function testSeparateRootDelegationsCannotMultiplyVaultDailyBudget() public {
        uint256 other = guard.registerDelegation(0, CHILD, limits(), recipients);
        for (uint256 i = 1; i <= 6; ++i) {
            executed(guard, request(i % 2 == 0 ? root : other, i, 50e6));
        }
        denied(guard, request(root, 7, 1), AgentGuard.Reason.DailyLimit);
        eq(spent(guard, 0), 300e6);
        eq(token.balanceOf(RECIPIENT), 300e6);
        require(guard.paused());
    }

    function testRollingFrequencyDoesNotResetAtFixedMinuteBoundary() public {
        AgentGuard.Limits memory policy = limits();
        policy.maxPaymentsPerWindow = 2;
        uint256 limited = guard.registerDelegation(0, CHILD, policy, recipients);
        // Solidity treats block.timestamp as stable within a transaction; vm.warp violates that assumption.
        uint256 start = 1_800_000_000;
        executed(guard, request(limited, 1, 1));
        vm.warp(start + 30);
        executed(guard, request(limited, 2, 1));
        vm.warp(start + 59);
        denied(guard, request(limited, 3, 1), AgentGuard.Reason.FrequencyLimit);
        vm.warp(start + 60);
        executed(guard, request(limited, 4, 1));
        vm.warp(start + 61);
        denied(guard, request(limited, 5, 1), AgentGuard.Reason.FrequencyLimit);
        eq(token.balanceOf(RECIPIENT), 3);
        require(!guard.paused());
    }

    function testDailyPauseCannotBeMaskedByExhaustedLeafFrequency() public {
        AgentGuard target = new AgentGuard(
            address(token), address(this), vm.addr(ATTESTOR_KEY), MONITOR, RECORDER, 100e6, 100e6, 50e6, 2, recipients
        );
        token.transfer(address(target), 100e6);
        AgentGuard.Limits memory policy = limits();
        policy.dailyLimitAtomic = 100e6;
        policy.maxPaymentsPerWindow = 1;
        uint256 a = target.registerDelegation(0, AGENT, policy, recipients);
        uint256 b = target.registerDelegation(0, CHILD, policy, recipients);
        executed(target, request(a, 1, 50e6));
        executed(target, request(b, 1, 50e6));
        denied(target, request(a, 2, 1), AgentGuard.Reason.DailyLimit);
        eq(spent(target, a), 50e6);
        eq(spent(target, 0), 100e6);
        require(target.paused());
    }

    function testSiblingAndRootFrequencyCapsAreAggregated() public {
        AgentGuard target = deploy(address(token), 2);
        token.transfer(address(target), 100e6);
        AgentGuard.Limits memory policy = limits();
        policy.maxPaymentsPerWindow = 2;
        uint256 a = target.registerDelegation(0, AGENT, policy, recipients);
        uint256 b = target.registerDelegation(0, CHILD, policy, recipients);
        executed(target, request(a, 1, 1));
        executed(target, request(b, 1, 1));
        denied(target, request(a, 2, 1), AgentGuard.Reason.FrequencyLimit);
        eq(token.balanceOf(RECIPIENT), 2);
        policy = limits();
        policy.maxPaymentsPerWindow = 1;
        uint256 parent = guard.registerDelegation(0, OTHER_CHILD, policy, recipients);
        uint256 first = child(parent, address(0x101), policy);
        uint256 second = child(parent, address(0x102), policy);
        executed(guard, request(first, 1, 1));
        denied(guard, request(second, 1, 1), AgentGuard.Reason.FrequencyLimit);
    }

    function testUtcDayCapResetsAtMidnightAndIsNotRolling24Hours() public {
        AgentGuard.Limits memory policy = limits();
        policy.maxPerTransferAtomic = 50e6;
        policy.dailyLimitAtomic = 50e6;
        uint256 limited = guard.registerDelegation(0, CHILD, policy, recipients);
        uint256 midnight = (block.timestamp / 1 days + 1) * 1 days;
        vm.warp(midnight - 1);
        executed(guard, request(limited, 1, 50e6));
        vm.warp(midnight);
        executed(guard, request(limited, 2, 50e6));
        eq(spent(guard, limited), 50e6);
        eq(token.balanceOf(RECIPIENT), 100e6);
    }

    function testThresholdAndExternalDocumentQueueWithoutReservingOrMovingFunds() public {
        bytes32 threshold = pending(request(root, 1, 51e6));
        AgentGuard.RuntimePayment memory externalSource = request(root, 2, 10e6);
        externalSource.origin = AgentGuard.Origin.ExternalDocument;
        externalSource.originActor = address(0);
        bytes32 externalId = pending(externalSource);
        eq(spent(guard, root), 0);
        eq(token.balanceOf(RECIPIENT), 0);
        vm.expectRevert(AgentGuard.UnauthorizedOwner.selector);
        vm.prank(AGENT);
        guard.approveRequest(externalId);
        (AgentGuard.Status status,) = guard.approveRequest(threshold);
        eq(uint256(status), uint256(AgentGuard.Status.Executed));
        guard.approveRequest(externalId);
        eq(token.balanceOf(RECIPIENT), 61e6);
        vm.expectRevert(AgentGuard.NotPending.selector);
        guard.approveRequest(externalId);
        denied(guard, request(root, 3, 100e6 + 1), AgentGuard.Reason.TransferLimit);
    }

    function testPendingApprovalRevalidatesRevocation() public {
        uint256 leaf = child(root, CHILD, limits());
        bytes32 id = pending(request(leaf, 1, 51e6));
        guard.revokeDelegation(root);
        (AgentGuard.Status status, AgentGuard.Reason reason) = guard.approveRequest(id);
        eq(uint256(status), uint256(AgentGuard.Status.Rejected));
        eq(uint256(reason), uint256(AgentGuard.Reason.Revoked));
        eq(token.balanceOf(RECIPIENT), 0);
    }

    function testPendingApprovalRevalidatesBudget() public {
        AgentGuard.Limits memory policy = limits();
        policy.dailyLimitAtomic = 100e6;
        uint256 limited = guard.registerDelegation(0, CHILD, policy, recipients);
        bytes32 id = pending(request(limited, 1, 80e6));
        executed(guard, request(limited, 2, 50e6));
        (, AgentGuard.Reason reason) = guard.approveRequest(id);
        eq(uint256(reason), uint256(AgentGuard.Reason.DailyLimit));
        eq(token.balanceOf(RECIPIENT), 50e6);
        require(guard.paused());
    }

    function testPendingApprovalRevalidatesFrequencyAndPause() public {
        AgentGuard.Limits memory policy = limits();
        policy.maxPaymentsPerWindow = 1;
        uint256 limited = guard.registerDelegation(0, CHILD, policy, recipients);
        bytes32 id = pending(request(limited, 1, 51e6));
        executed(guard, request(limited, 2, 1));
        (, AgentGuard.Reason reason) = guard.approveRequest(id);
        eq(uint256(reason), uint256(AgentGuard.Reason.FrequencyLimit));
        bytes32 second = pending(request(root, 1, 51e6));
        vm.prank(MONITOR);
        guard.pause(keccak256("incident"));
        (, reason) = guard.approveRequest(second);
        eq(uint256(reason), uint256(AgentGuard.Reason.Paused));
        eq(token.balanceOf(RECIPIENT), 1);
    }

    function testDeadlineBoundaryRejectAndExplicitExpiry() public {
        AgentGuard.RuntimePayment memory payment = request(root, 1, 51e6);
        bytes32 id = pending(payment);
        vm.expectRevert(AgentGuard.NotExpired.selector);
        guard.expireRequest(id);
        vm.warp(payment.deadline);
        guard.expireRequest(id);
        eq(uint256(guard.getRequest(id).status), uint256(AgentGuard.Status.Expired));
        vm.expectRevert(AgentGuard.NotPending.selector);
        guard.approveRequest(id);
        payment = request(root, 2, 51e6);
        id = pending(payment);
        vm.warp(payment.deadline);
        (AgentGuard.Status status, AgentGuard.Reason reason) = guard.approveRequest(id);
        eq(uint256(status), uint256(AgentGuard.Status.Expired));
        eq(uint256(reason), uint256(AgentGuard.Reason.Expired));
        eq(token.balanceOf(RECIPIENT), 0);
    }

    function testAuthenticatedDenialCircuitPersistsAndIgnoresReplay() public {
        AgentGuard.RuntimePayment memory payment = request(root, 1, 1);
        payment.recipient = address(0xBAD);
        denied(guard, payment, AgentGuard.Reason.RecipientNotAllowed);
        for (uint256 i; i < 5; ++i) {
            denied(guard, payment, AgentGuard.Reason.NonceUnavailable);
        }
        require(!guard.paused());
        payment.nonce = 2;
        denied(guard, payment, AgentGuard.Reason.RecipientNotAllowed);
        require(!guard.paused());
        payment.nonce = 3;
        denied(guard, payment, AgentGuard.Reason.RecipientNotAllowed);
        require(guard.paused());
        eq(token.balanceOf(RECIPIENT), 0);
        denied(guard, request(root, 4, 1), AgentGuard.Reason.Paused);
        guard.resume();
        executed(guard, request(root, 5, 1));
    }

    function testRefusalWindowExcludesItsExactTenMinuteBoundary() public {
        AgentGuard.RuntimePayment memory payment = request(root, 1, 1);
        payment.recipient = address(0xBAD);
        denied(guard, payment, AgentGuard.Reason.RecipientNotAllowed);
        payment.nonce = 2;
        denied(guard, payment, AgentGuard.Reason.RecipientNotAllowed);
        vm.warp(block.timestamp + 600);
        payment = request(root, 3, 1);
        payment.recipient = address(0xBAD);
        denied(guard, payment, AgentGuard.Reason.RecipientNotAllowed);
        require(!guard.paused());
    }

    function testMonitorCanOnlyPauseAndOwnerAloneResumesOrRejects() public {
        bytes32 id = pending(request(root, 1, 51e6));
        AgentGuard.Limits memory policy = limits();
        vm.expectRevert(AgentGuard.UnauthorizedOwner.selector);
        vm.prank(MONITOR);
        guard.approveRequest(id);
        vm.expectRevert(AgentGuard.UnauthorizedOwner.selector);
        vm.prank(MONITOR);
        guard.rejectRequest(id);
        vm.expectRevert(AgentGuard.UnauthorizedDelegation.selector);
        vm.prank(MONITOR);
        guard.registerDelegation(0, CHILD, policy, recipients);
        vm.expectRevert(AgentGuard.UnauthorizedRecorder.selector);
        vm.prank(MONITOR);
        guard.anchorReport(keccak256("id"), keccak256("report"));
        vm.prank(MONITOR);
        guard.pause(keccak256("incident"));
        require(guard.paused());
        vm.expectRevert(AgentGuard.UnauthorizedOwner.selector);
        vm.prank(MONITOR);
        guard.resume();
        guard.resume();
        require(!guard.paused());
        guard.rejectRequest(id);
        eq(uint256(guard.getRequest(id).reason), uint256(AgentGuard.Reason.OwnerRejected));
        eq(token.balanceOf(RECIPIENT), 0);
    }

    function testAnchorsAreAuthorizedImmutableAndEmitCommittedRootMetadata() public {
        bytes32 id = keccak256("batch-1");
        bytes32 hash = keccak256("root");
        bytes32 manifest = keccak256("manifest");
        logsVm.recordLogs();
        vm.prank(RECORDER);
        guard.anchorBatch(id, hash, 3, manifest);
        AgentLogVm.Log[] memory entries = logsVm.getRecordedLogs();
        eq(guard.anchoredHash(id), hash);
        eq(entries[0].topics[0], keccak256("DecisionBatchAnchored(bytes32,bytes32,uint32,bytes32)"));
        eq(entries[0].topics[1], id);
        eq(entries[0].topics[2], hash);
        (uint32 count, bytes32 observed) = abi.decode(entries[0].data, (uint32, bytes32));
        eq(count, 3);
        eq(observed, manifest);
        vm.expectRevert(AgentGuard.InvalidAnchor.selector);
        guard.anchorReport(id, keccak256("different"));
        vm.expectRevert(AgentGuard.UnauthorizedRecorder.selector);
        vm.prank(AGENT);
        guard.anchorReport(keccak256("new"), hash);
        bytes32 rejected = keccak256("bad batch");
        vm.expectRevert(AgentGuard.InvalidAnchor.selector);
        guard.anchorBatch(rejected, hash, 0, manifest);
        eq(guard.anchoredHash(rejected), bytes32(0));
        guard.anchorReport(keccak256("report-1"), hash);
        eq(guard.anchoredHash(keccak256("report-1")), hash);
    }

    function testTokenFailuresRollBackNonceStatusAndAllBudgets() public {
        for (uint8 mode = 1; mode <= 3; ++mode) {
            AgentAdversarialToken bad = new AgentAdversarialToken();
            AgentGuard target = deploy(address(bad), 8);
            bad.transfer(address(target), 100e6);
            uint256 grant = target.registerDelegation(0, AGENT, limits(), recipients);
            AgentGuard.RuntimePayment memory payment = request(grant, 1, 10e6);
            payment.token = address(bad);
            bytes memory signature = runtimeSign(target, payment);
            bytes32 id = target.hashRequest(payment);
            bad.configure(mode, target, payment, signature);
            vm.expectRevert();
            vm.prank(AGENT);
            target.submitRequest(payment, signature);
            require(!target.nonceUsed(AGENT, 1));
            eq(uint256(target.getRequest(id).status), 0);
            eq(spent(target, 0), 0);
            eq(spent(target, grant), 0);
            eq(bad.balanceOf(address(target)), 100e6);
            eq(bad.balanceOf(RECIPIENT), 0);
        }
    }

    function testOwnerApprovalTransferFailurePreservesPendingAndCommitsExactReceiptOnRetry() public {
        AgentAdversarialToken bad = new AgentAdversarialToken();
        AgentGuard target = deploy(address(bad), 8);
        bad.transfer(address(target), 100e6);
        uint256 grant = target.registerDelegation(0, AGENT, limits(), recipients);
        AgentGuard.RuntimePayment memory payment = request(grant, 1, 10e6);
        payment.token = address(bad);
        payment.origin = AgentGuard.Origin.ExternalDocument;
        payment.originActor = address(0);
        bytes32 id;
        AgentGuard.Status status;
        (id, status,) = submit(target, payment);
        eq(uint256(status), uint256(AgentGuard.Status.Pending));
        bytes memory signature = runtimeSign(target, payment);
        bad.configure(1, target, payment, signature);
        vm.expectRevert();
        target.approveRequest(id);
        require(target.nonceUsed(AGENT, 1));
        eq(uint256(target.getRequest(id).status), uint256(AgentGuard.Status.Pending));
        eq(spent(target, 0), 0);
        eq(spent(target, grant), 0);
        eq(bad.balanceOf(RECIPIENT), 0);
        bad.configure(0, target, payment, signature);
        logsVm.recordLogs();
        target.approveRequest(id);
        AgentLogVm.Log[] memory entries = logsVm.getRecordedLogs();
        eq(entries[0].topics[0], keccak256("OwnerApproved(bytes32,address)"));
        eq(entries[0].topics[1], id);
        eq(entries[0].topics[2], bytes32(uint256(uint160(address(this)))));
        AgentLogVm.Log memory receipt = entries[entries.length - 1];
        eq(
            receipt.topics[0],
            keccak256(
                "AgentPaymentExecuted(bytes32,uint256,address,address,address,uint256,uint256,uint8,address,bytes32,bytes32)"
            )
        );
        eq(receipt.topics[1], id);
        eq(receipt.topics[2], bytes32(grant));
        (
            address recipient,
            address asset,
            uint256 amount,
            uint256 nonce,
            AgentGuard.Origin origin,
            address actor,
            bytes32 source,
            bytes32 evidence
        ) = abi.decode(receipt.data, (address, address, uint256, uint256, AgentGuard.Origin, address, bytes32, bytes32));
        require(recipient == RECIPIENT && asset == address(bad) && actor == address(0));
        eq(amount, 10e6);
        eq(nonce, 1);
        eq(uint256(origin), uint256(AgentGuard.Origin.ExternalDocument));
        eq(source, payment.sourceCommitment);
        eq(evidence, payment.evidenceCommitment);
        eq(uint256(target.getRequest(id).status), uint256(AgentGuard.Status.Executed));
        eq(spent(target, 0), 10e6);
        eq(spent(target, grant), 10e6);
        eq(bad.balanceOf(RECIPIENT), 10e6);
    }

    function testTrustBoundaryFreshNoncesDoNotDeduplicateBusinessObligations() public {
        AgentGuard.RuntimePayment memory first = request(root, 1, 10e6);
        AgentGuard.RuntimePayment memory second = request(root, 2, 10e6);
        eq(first.sourceCommitment, second.sourceCommitment);
        eq(first.evidenceCommitment, second.evidenceCommitment);
        // Generic delegated transfers have nonce replay protection, not an invoice-once registry.
        executed(guard, first);
        executed(guard, second);
        eq(token.balanceOf(RECIPIENT), 20e6);
        eq(spent(guard, root), 20e6);
    }

    function testNonceIsSharedAcrossGrantsAndRejectedRequestsCannotRetry() public {
        uint256 alternate = guard.registerDelegation(0, AGENT, limits(), recipients);
        AgentGuard.RuntimePayment memory payment = request(root, 1, 1);
        payment.recipient = address(0xBAD);
        bytes32 deniedId = denied(guard, payment, AgentGuard.Reason.RecipientNotAllowed);
        denied(guard, request(alternate, 1, 1), AgentGuard.Reason.NonceUnavailable);
        vm.expectRevert(AgentGuard.NotPending.selector);
        guard.approveRequest(deniedId);
        executed(guard, request(alternate, 2, 1));
        eq(token.balanceOf(RECIPIENT), 1);
    }

    function testMalleatedRuntimeSignatureCannotConsumeOrPause() public {
        AgentGuard.RuntimePayment memory payment = request(root, 1, 1);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTESTOR_KEY, guard.hashRequest(payment));
        uint256 order = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141;
        bytes memory highS = abi.encodePacked(r, bytes32(order - uint256(s)), v == 27 ? uint8(28) : uint8(27));
        vm.prank(AGENT);
        (,, AgentGuard.Reason reason) = guard.submitRequest(payment, highS);
        eq(uint256(reason), uint256(AgentGuard.Reason.InvalidRuntimeSignature));
        require(!guard.nonceUsed(AGENT, 1) && !guard.paused());
        executed(guard, payment);
    }

    function testReentrantTokenCannotConsumeAnotherAuthorization() public {
        AgentAdversarialToken bad = new AgentAdversarialToken();
        AgentGuard target = deploy(address(bad), 8);
        bad.transfer(address(target), 100e6);
        uint256 grant = target.registerDelegation(0, address(bad), limits(), recipients);
        AgentGuard.RuntimePayment memory nested = request(grant, 2, 10e6);
        nested.token = address(bad);
        bad.configure(4, target, nested, runtimeSign(target, nested));
        AgentGuard.RuntimePayment memory outer = request(grant, 1, 10e6);
        outer.token = address(bad);
        executed(target, outer);
        require(bad.callbackBlocked());
        require(!target.nonceUsed(address(bad), 2));
        eq(spent(target, 0), 10e6);
        eq(bad.balanceOf(RECIPIENT), 10e6);
    }

    function testMalformedTimeTokenAndCommitmentRequestsFailClosed() public {
        AgentGuard.RuntimePayment memory payment = request(root, 1, 1);
        payment.sourceCommitment = 0;
        denied(guard, payment, AgentGuard.Reason.MalformedRequest);
        payment = request(root, 2, 1);
        payment.evidenceCommitment = 0;
        denied(guard, payment, AgentGuard.Reason.MalformedRequest);
        payment = request(root, 3, 1);
        payment.token = address(0xBAD);
        denied(guard, payment, AgentGuard.Reason.WrongToken);
        guard.resume();
        vm.warp(block.timestamp + 601);
        payment = request(root, 4, 1);
        payment.issuedAt++;
        denied(guard, payment, AgentGuard.Reason.MalformedRequest);
        payment = request(root, 5, 1);
        payment.deadline++;
        denied(guard, payment, AgentGuard.Reason.MalformedRequest);
        payment = request(root, 6, 1);
        payment.deadline = payment.issuedAt;
        denied(guard, payment, AgentGuard.Reason.MalformedRequest);
        eq(token.balanceOf(RECIPIENT), 0);
    }

    function testConstructorAndRoleSeparationRejectInvalidConfigurations() public {
        address attestor = vm.addr(ATTESTOR_KEY);
        vm.expectRevert(AgentGuard.InvalidConfiguration.selector);
        new AgentGuard(address(token), address(this), attestor, MONITOR, MONITOR, 100, 300, 50, 8, recipients);
        vm.expectRevert(AgentGuard.InvalidConfiguration.selector);
        new AgentGuard(address(token), address(this), attestor, MONITOR, RECORDER, 100, 99, 50, 8, recipients);
        vm.expectRevert(AgentGuard.InvalidConfiguration.selector);
        new AgentGuard(address(token), address(this), attestor, MONITOR, RECORDER, 100, 300, 101, 8, recipients);
        vm.expectRevert(AgentGuard.InvalidConfiguration.selector);
        new AgentGuard(address(token), address(this), attestor, MONITOR, RECORDER, 100, 300, 50, 65, recipients);
        WrongDecimals wrong = new WrongDecimals();
        vm.expectRevert(AgentGuard.InvalidConfiguration.selector);
        deploy(address(wrong), 8);
        address[] memory duplicated = new address[](2);
        duplicated[0] = RECIPIENT;
        duplicated[1] = RECIPIENT;
        vm.expectRevert(AgentGuard.InvalidConfiguration.selector);
        new AgentGuard(address(token), address(this), attestor, MONITOR, RECORDER, 100, 300, 50, 8, duplicated);
        AgentGuard.Limits memory policy = limits();
        vm.expectRevert(AgentGuard.InvalidDelegation.selector);
        guard.registerDelegation(0, MONITOR, policy, recipients);
    }

    function testFuzzExactAutomaticAmountPreservesConservation(uint256 candidate) public {
        uint256 amount = candidate % 50e6 + 1;
        executed(guard, request(root, 1, amount));
        eq(token.balanceOf(RECIPIENT), amount);
        eq(token.balanceOf(address(guard)), 1_000e6 - amount);
        eq(spent(guard, 0), amount);
    }
}

contract AgentGuardHandler is TestBase {
    AgentGuard public guard;
    uint256 public first;
    uint256 public second;
    uint256 public nonce;
    uint256 public transferred;
    uint256 private constant KEY = 0xA77E57;

    constructor(AgentGuard target, uint256 a, uint256 b) {
        guard = target;
        first = a;
        second = b;
    }

    function attempt(uint32 amountSeed, bool chooseSecond, bool wrongRecipient) external {
        uint256 grant = chooseSecond ? second : first;
        AgentGuard.RuntimePayment memory payment = AgentGuard.RuntimePayment(
            grant,
            wrongRecipient ? address(0xBAD) : address(0xBEEF),
            guard.token(),
            uint256(amountSeed) % 50e6 + 1,
            ++nonce,
            uint64(block.timestamp),
            uint64(block.timestamp + 600),
            AgentGuard.Origin.Human,
            guard.owner(),
            keccak256("source"),
            keccak256("evidence")
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, guard.hashRequest(payment));
        address agent = guard.getDelegation(grant).agent;
        vm.prank(agent);
        (, AgentGuard.Status status,) = guard.submitRequest(payment, abi.encodePacked(r, s, v));
        if (status == AgentGuard.Status.Executed) transferred += payment.amountAtomic;
    }

    function resume() external {
        vm.prank(guard.owner());
        guard.resume();
    }
}

contract AgentGuardInvariantTest is TestBase {
    DemoToken private token;
    AgentGuard private guard;
    AgentGuardHandler private handler;
    uint256 private parent;
    uint256 private first;
    uint256 private second;
    address[] private targets;

    function setUp() public {
        vm.warp(1_800_000_000);
        token = new DemoToken(address(this));
        address[] memory recipients = new address[](1);
        recipients[0] = address(0xBEEF);
        guard = new AgentGuard(
            address(token),
            address(this),
            vm.addr(0xA77E57),
            address(0xF00),
            address(0xFEE),
            100e6,
            300e6,
            50e6,
            64,
            recipients
        );
        token.transfer(address(guard), 1_000e6);
        AgentGuard.Limits memory policy =
            AgentGuard.Limits(100e6, 200e6, 50e6, uint64(block.timestamp), uint64(block.timestamp + 2 days), 64, true);
        parent = guard.registerDelegation(0, address(0xA1), policy, recipients);
        policy.dailyLimitAtomic = 150e6;
        vm.prank(address(0xA1));
        first = guard.registerDelegation(parent, address(0xA2), policy, recipients);
        vm.prank(address(0xA1));
        second = guard.registerDelegation(parent, address(0xA3), policy, recipients);
        handler = new AgentGuardHandler(guard, first, second);
        targets.push(address(handler));
    }

    function targetContracts() external view returns (address[] memory) {
        return targets;
    }

    function invariantSharedAncestorLimitsAndExactConservation() public view {
        (, uint256 global) = guard.dailyUsage(0);
        (, uint256 aggregate) = guard.dailyUsage(parent);
        (, uint256 a) = guard.dailyUsage(first);
        (, uint256 b) = guard.dailyUsage(second);
        require(a <= 150e6 && b <= 150e6 && aggregate <= 200e6 && global <= 300e6, "budget exceeded");
        eq(aggregate, a + b);
        eq(global, aggregate);
        eq(handler.transferred(), global);
        eq(token.balanceOf(address(0xBEEF)), global);
        eq(token.balanceOf(address(guard)), 1_000e6 - global);
    }
}
