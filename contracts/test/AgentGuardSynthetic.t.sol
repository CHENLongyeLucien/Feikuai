// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {AgentGuard} from "../src/AgentGuard.sol";
import {DemoToken} from "../src/DemoToken.sol";
import {TestBase} from "./PaymentGuard.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Authored experimental control, not an implementation of any named third-party product.
contract AgentBudgetOnlyComparator {
    IERC20 private immutable asset;
    address private immutable agent;
    uint256 private immutable expiresAt;
    uint256 private immutable dailyLimit;
    uint256 private day;
    uint256 private spent;

    constructor(IERC20 token, address delegate, uint256 cap, uint256 expiry) {
        asset = token;
        agent = delegate;
        dailyLimit = cap;
        expiresAt = expiry;
    }

    function pay(address recipient, uint256 amount) external {
        require(msg.sender == agent && block.timestamp < expiresAt, "authority expired");
        if (day != block.timestamp / 1 days) {
            day = block.timestamp / 1 days;
            spent = 0;
        }
        require(amount > 0 && amount <= dailyLimit - spent, "budget exceeded");
        spent += amount;
        require(asset.transfer(recipient, amount), "transfer failed");
    }
}

/// @notice Deterministic policy scenarios, not a representative fraud dataset or latency benchmark.
contract AgentGuardSyntheticTest is TestBase {
    event log_named_uint(string key, uint256 value);
    uint256 private constant START = 1_800_000_000;
    uint256 private constant KEY = 0xA77E57;
    address private constant AGENT = address(0xA1);
    address private constant RECIPIENT = address(0xBEEF);
    DemoToken private token;
    AgentGuard private guard;
    AgentBudgetOnlyComparator private baseline;
    uint256 private grant;

    function setUp() public {
        vm.warp(START);
        token = new DemoToken(address(this));
        address[] memory recipients = new address[](1);
        recipients[0] = RECIPIENT;
        guard = new AgentGuard(
            address(token),
            address(this),
            vm.addr(KEY),
            address(0xF00),
            address(0xFEE),
            100e6,
            10_000e6,
            50e6,
            64,
            recipients
        );
        AgentGuard.Limits memory policy =
            AgentGuard.Limits(100e6, 10_000e6, 50e6, uint64(START), uint64(START + 2 days), 64, false);
        grant = guard.registerDelegation(0, AGENT, policy, recipients);
        baseline = new AgentBudgetOnlyComparator(IERC20(address(token)), AGENT, 10_000e6, START + 2 days);
        token.transfer(address(guard), 10_000e6);
        token.transfer(address(baseline), 10_000e6);
    }

    function payment(uint256 nonce) private view returns (AgentGuard.RuntimePayment memory) {
        return AgentGuard.RuntimePayment(
            grant,
            RECIPIENT,
            address(token),
            1e6,
            nonce,
            uint64(block.timestamp),
            uint64(block.timestamp + 600),
            AgentGuard.Origin.Human,
            address(this),
            keccak256(abi.encode("synthetic source", nonce)),
            keccak256(abi.encode("synthetic evidence", nonce))
        );
    }

    function submit(AgentGuard.RuntimePayment memory request) private returns (AgentGuard.Status status) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, guard.hashRequest(request));
        vm.prank(AGENT);
        (, status,) = guard.submitRequest(request, abi.encodePacked(r, s, v));
    }

    function testAuthored500Normal50AttackComparison() public {
        uint256 normalExecuted;
        uint256 attackExecuted;
        uint256 attackRejected;
        uint256 attackPending;
        uint256 baselineNormalExecuted;
        uint256 baselineAttackExecuted;
        for (uint256 i; i < 500; ++i) {
            vm.warp(START + i);
            AgentGuard.RuntimePayment memory request = payment(i + 1);
            if (submit(request) == AgentGuard.Status.Executed) normalExecuted++;
            vm.prank(AGENT);
            baseline.pay(request.recipient, request.amountAtomic);
            baselineNormalExecuted++;
        }
        // Space scenarios so the refusal circuit does not obscure the individual policy under examination.
        // Separate burst/circuit, hierarchical-budget, and trust-boundary tests live in AgentGuard.t.sol.
        for (uint256 i; i < 50; ++i) {
            vm.warp(START + 1_000 + i * 601);
            AgentGuard.RuntimePayment memory request = payment(1_000 + i);
            if (i < 10) {
                request.recipient = address(uint160(0xBAD + i));
            } else if (i < 20) {
                request.origin = AgentGuard.Origin.Agent;
                request.originActor = address(uint160(0xC00 + i));
            } else if (i < 30) {
                request.origin = AgentGuard.Origin.ExternalDocument;
                request.originActor = address(0);
            } else if (i < 40) {
                request.amountAtomic = (51 + i - 30) * 1e6;
            } else {
                request.nonce = i - 39;
            }
            AgentGuard.Status status = submit(request);
            if (status == AgentGuard.Status.Executed) attackExecuted++;
            else if (status == AgentGuard.Status.Pending) attackPending++;
            else if (status == AgentGuard.Status.Rejected) attackRejected++;
            vm.prank(AGENT);
            baseline.pay(request.recipient, request.amountAtomic);
            baselineAttackExecuted++;
        }
        eq(normalExecuted, 500);
        eq(attackExecuted, 0);
        eq(attackRejected, 30);
        eq(attackPending, 20);
        eq(baselineNormalExecuted, 500);
        eq(baselineAttackExecuted, 50);
        eq(token.balanceOf(address(guard)), 9_500e6);
        eq(token.balanceOf(address(baseline)), 8_905e6);
        emit log_named_uint("authored normal scenarios", 500);
        emit log_named_uint("AgentGuard normal executions", normalExecuted);
        emit log_named_uint("authored attack / escalation scenarios", 50);
        emit log_named_uint("AgentGuard rejected attacks", attackRejected);
        emit log_named_uint("AgentGuard pending owner review", attackPending);
        emit log_named_uint("AgentGuard executed attacks", attackExecuted);
        emit log_named_uint("budget-only comparator executed attacks", baselineAttackExecuted);
    }
}
