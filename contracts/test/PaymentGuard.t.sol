// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {PaymentGuard} from "../src/PaymentGuard.sol";
import {DemoToken} from "../src/DemoToken.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface Vm {
    function addr(uint256 key) external returns (address);
    function sign(uint256 key, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256) external;
    function chainId(uint256) external;
    function prank(address) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function getNonce(address) external view returns (uint64);
    function computeCreateAddress(address, uint256) external pure returns (address);
}

contract TestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    function eq(uint256 a, uint256 b) internal pure { require(a == b, "uint mismatch"); }
    function eq(bytes32 a, bytes32 b) internal pure { require(a == b, "bytes32 mismatch"); }
    function sign(PaymentGuard guard, PaymentGuard.Payment memory p, uint256 key) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, guard.hashPayment(p));
        return abi.encodePacked(r, s, v);
    }
}

contract AdversarialToken is ERC20 {
    uint8 public behavior;
    PaymentGuard public guard;
    PaymentGuard.Payment private callbackPayment;
    bytes private callbackSignature;
    bool public callbackBlocked;
    constructor() ERC20("Adversarial", "BAD") { _mint(msg.sender, 1_000_000e6); }
    function decimals() public pure override returns (uint8) { return 6; }
    function configure(uint8 b, PaymentGuard g, PaymentGuard.Payment memory p, bytes memory s) external {
        behavior = b; guard = g; callbackPayment = p; callbackSignature = s;
    }
    function transfer(address to, uint256 value) public override returns (bool) {
        if (behavior == 1) return false;
        if (behavior == 2) revert("token revert");
        if (behavior == 3) { _transfer(msg.sender, to, value - 1); return true; }
        if (behavior == 4) {
            try guard.executePayment(callbackPayment, callbackSignature) { revert("reentrancy allowed"); }
            catch (bytes memory reason) { callbackBlocked = reason.length >= 4 && bytes4(reason) == bytes4(keccak256("ReentrancyGuardReentrantCall()")); }
        }
        return super.transfer(to, value);
    }
}

contract WrongDecimals is ERC20 { constructor() ERC20("Wrong", "WRONG") {} }

contract PaymentGuardTest is TestBase {
    uint256 internal constant KEY = 0xA11CE;
    address internal signer;
    address internal constant RECIPIENT = address(0xB0B);
    bytes32[] internal keys;
    address[] internal recipients;
    DemoToken internal token;
    PaymentGuard internal guard;

    function setUp() public {
        vm.warp(1_800_000_000);
        signer = vm.addr(KEY);
        token = new DemoToken(address(this));
        keys.push(bytes32(uint256(1))); recipients.push(RECIPIENT);
        guard = deploy(address(token));
        token.transfer(address(guard), 300_000e6);
    }
    function deploy(address asset) internal returns (PaymentGuard) { return new PaymentGuard(asset, signer, 50_000e6, 600, keys, recipients); }
    function payment() internal view returns (PaymentGuard.Payment memory) {
        return PaymentGuard.Payment(bytes32(uint256(42)), keys[0], RECIPIENT, address(token), 48_000e6,
            123, uint64(block.timestamp), uint64(block.timestamp + 600), keccak256("evidence"), guard.policyId());
    }
    function execute(PaymentGuard.Payment memory p) internal returns (bytes32) { return guard.executePayment(p, sign(guard, p, KEY)); }
    function reject(PaymentGuard.Payment memory p, bytes4 selector) internal {
        bytes memory sig = sign(guard, p, KEY);
        vm.expectRevert(selector); guard.executePayment(p, sig);
        eq(uint256(guard.nonceState(p.authorizationNonce)), 0);
        eq(guard.invoiceSettlementDigest(p.invoiceKey), bytes32(0));
    }
    function testTokenAndPolicy() public view {
        eq(token.decimals(), 6); eq(token.totalSupply(), 1_000_000e6);
        eq(guard.registryHash(), keccak256(abi.encode(keys, recipients)));
        eq(guard.policyId(), keccak256(abi.encode(guard.POLICY_TYPEHASH(), address(token), signer, uint256(50_000e6), uint64(600), guard.registryHash(), guard.PAYMENT_TYPEHASH())));
    }
    function testExactTransferAndReplay() public {
        PaymentGuard.Payment memory p = payment(); bytes memory sig = sign(guard, p, KEY);
        bytes32 digest = guard.executePayment(p, sig);
        eq(token.balanceOf(RECIPIENT), 48_000e6); eq(token.balanceOf(address(guard)), 252_000e6);
        eq(guard.invoiceSettlementDigest(p.invoiceKey), digest); eq(uint256(guard.nonceState(123)), 1);
        vm.expectRevert(PaymentGuard.NonceUnavailable.selector); guard.executePayment(p, sig);
        eq(token.balanceOf(RECIPIENT), 48_000e6);
    }
    function testTwoNoncesSameInvoiceOnlyOnePays() public {
        PaymentGuard.Payment memory p = payment(); execute(p); p.authorizationNonce = 124;
        bytes memory sig = sign(guard, p, KEY);
        vm.expectRevert(PaymentGuard.InvoiceAlreadySettled.selector); guard.executePayment(p, sig);
        eq(uint256(guard.nonceState(124)), 0); eq(token.balanceOf(RECIPIENT), 48_000e6);
    }
    function testUnsignedAndWrongSigner() public {
        PaymentGuard.Payment memory p = payment();
        vm.expectRevert(PaymentGuard.InvalidApproval.selector); guard.executePayment(p, "");
        bytes memory sig = sign(guard, p, 7);
        vm.expectRevert(PaymentGuard.InvalidApproval.selector); guard.executePayment(p, sig);
    }
    function testEverySignedFieldBinding() public {
        for (uint256 i; i < 10; ++i) {
            PaymentGuard.Payment memory p = payment(); bytes memory sig = sign(guard, p, KEY);
            if (i == 0) p.invoiceKey = bytes32(uint256(43));
            if (i == 1) p.supplierKey = bytes32(uint256(2));
            if (i == 2) p.recipient = address(0xBAD);
            if (i == 3) p.token = address(0xBAD);
            if (i == 4) p.amountAtomic++;
            if (i == 5) p.authorizationNonce++;
            if (i == 6) p.issuedAt--;
            if (i == 7) p.deadline--;
            if (i == 8) p.evidenceCommitment = keccak256("altered");
            if (i == 9) p.policyId = keccak256("altered");
            vm.expectRevert(PaymentGuard.InvalidApproval.selector); guard.executePayment(p, sig);
        }
    }
    function testWrongChainAndVaultDomain() public {
        PaymentGuard.Payment memory p = payment(); bytes memory sig = sign(guard, p, KEY);
        uint256 chain = block.chainid; vm.chainId(chain + 1);
        vm.expectRevert(PaymentGuard.InvalidApproval.selector); guard.executePayment(p, sig);
        vm.chainId(chain); PaymentGuard other = deploy(address(token));
        vm.expectRevert(PaymentGuard.InvalidApproval.selector); other.executePayment(p, sig);
    }
    function testWrongDomainNameAndVersion() public {
        PaymentGuard.Payment memory p = payment();
        bytes32 structure = keccak256(abi.encode(guard.PAYMENT_TYPEHASH(), p.invoiceKey, p.supplierKey, p.recipient,
            p.token, p.amountAtomic, p.authorizationNonce, p.issuedAt, p.deadline, p.evidenceCommitment, p.policyId));
        bytes32 domainType = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
        for (uint256 i; i < 2; ++i) {
            bytes32 domain = keccak256(abi.encode(domainType, keccak256(bytes(i == 0 ? "WrongName" : "SecureFinancePaymentGuard")),
                keccak256(bytes(i == 1 ? "2" : "1")), block.chainid, address(guard)));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, keccak256(abi.encodePacked(hex"1901", domain, structure)));
            vm.expectRevert(PaymentGuard.InvalidApproval.selector); guard.executePayment(p, abi.encodePacked(r, s, v));
        }
    }
    function testMalformedECDSASignatures() public {
        PaymentGuard.Payment memory p = payment();
        vm.expectRevert(PaymentGuard.InvalidApproval.selector); guard.executePayment(p, new bytes(64));
        vm.expectRevert(PaymentGuard.InvalidApproval.selector); guard.executePayment(p, new bytes(65));
        bytes memory highS = abi.encodePacked(bytes32(uint256(1)), bytes32(type(uint256).max), uint8(27));
        vm.expectRevert(PaymentGuard.InvalidApproval.selector); guard.executePayment(p, highS);
    }
    function testSignedInvalidPolicy() public { PaymentGuard.Payment memory p = payment(); p.policyId = bytes32(uint256(1)); reject(p, PaymentGuard.WrongPolicy.selector); }
    function testSignedInvalidToken() public { PaymentGuard.Payment memory p = payment(); p.token = address(0xBAD); reject(p, PaymentGuard.WrongToken.selector); }
    function testSignedUnknownSupplier() public { PaymentGuard.Payment memory p = payment(); p.supplierKey = bytes32(uint256(2)); reject(p, PaymentGuard.UnknownSupplier.selector); }
    function testSignedWrongRecipient() public { PaymentGuard.Payment memory p = payment(); p.recipient = address(0xBAD); reject(p, PaymentGuard.WrongRecipient.selector); }
    function testSignedZeroAmount() public { PaymentGuard.Payment memory p = payment(); p.amountAtomic = 0; reject(p, PaymentGuard.InvalidAmount.selector); }
    function testSignedOversizedAmount() public { PaymentGuard.Payment memory p = payment(); p.amountAtomic = 50_000e6 + 1; reject(p, PaymentGuard.InvalidAmount.selector); }
    function testZeroInvoiceNonceEvidence() public {
        PaymentGuard.Payment memory p = payment(); p.invoiceKey = 0; reject(p, PaymentGuard.MalformedPayment.selector);
        p = payment(); p.authorizationNonce = 0; reject(p, PaymentGuard.MalformedPayment.selector);
        p = payment(); p.evidenceCommitment = 0; reject(p, PaymentGuard.MalformedPayment.selector);
    }
    function testFutureIssuance() public { PaymentGuard.Payment memory p = payment(); p.issuedAt++; reject(p, PaymentGuard.FutureIssuance.selector); }
    function testInvalidTimeWindows() public {
        PaymentGuard.Payment memory p = payment(); p.deadline = p.issuedAt; reject(p, PaymentGuard.InvalidTimeWindow.selector);
        p.deadline = p.issuedAt - 1; reject(p, PaymentGuard.InvalidTimeWindow.selector);
        p.deadline = p.issuedAt + 601; reject(p, PaymentGuard.InvalidTimeWindow.selector);
    }
    function testExactDeadlineExpired() public { PaymentGuard.Payment memory p = payment(); vm.warp(p.deadline); reject(p, PaymentGuard.ApprovalExpired.selector); }
    function testDeadlineMinusOneValid() public { PaymentGuard.Payment memory p = payment(); vm.warp(p.deadline - 1); execute(p); }
    function testCancelBeforePayment() public {
        PaymentGuard.Payment memory p = payment(); vm.prank(signer); guard.cancelNonce(p.authorizationNonce);
        bytes memory sig = sign(guard, p, KEY);
        vm.expectRevert(PaymentGuard.NonceUnavailable.selector); guard.executePayment(p, sig);
        eq(uint256(guard.nonceState(123)), 2); eq(token.balanceOf(RECIPIENT), 0);
        vm.expectRevert(PaymentGuard.NonceUnavailable.selector); vm.prank(signer); guard.cancelNonce(123);
    }
    function testExecutionWinsCancellationRace() public {
        execute(payment()); vm.expectRevert(PaymentGuard.NonceUnavailable.selector); vm.prank(signer); guard.cancelNonce(123);
        eq(token.balanceOf(RECIPIENT), 48_000e6);
    }
    function testUnauthorizedAndZeroCancellation() public {
        vm.expectRevert(PaymentGuard.UnauthorizedCancellation.selector); guard.cancelNonce(123);
        vm.expectRevert(PaymentGuard.MalformedPayment.selector); vm.prank(signer); guard.cancelNonce(0);
    }
    function testTransferFailuresRollback() public {
        for (uint8 mode = 1; mode <= 3; ++mode) {
            AdversarialToken bad = new AdversarialToken(); PaymentGuard target = deploy(address(bad)); bad.transfer(address(target), 300_000e6);
            PaymentGuard.Payment memory p = payment(); p.token = address(bad); p.policyId = target.policyId();
            bytes memory sig = sign(target, p, KEY); bad.configure(mode, target, p, sig);
            vm.expectRevert(); target.executePayment(p, sig);
            eq(uint256(target.nonceState(p.authorizationNonce)), 0); eq(target.invoiceSettlementDigest(p.invoiceKey), bytes32(0));
            eq(bad.balanceOf(address(target)), 300_000e6); eq(bad.balanceOf(RECIPIENT), 0);
        }
    }
    function testInsufficientLiquidityRollback() public {
        PaymentGuard empty = deploy(address(token)); PaymentGuard.Payment memory p = payment(); p.policyId = empty.policyId(); bytes memory sig = sign(empty, p, KEY);
        vm.expectRevert(); empty.executePayment(p, sig); eq(uint256(empty.nonceState(123)), 0); eq(empty.invoiceSettlementDigest(p.invoiceKey), bytes32(0));
    }
    function testReentrantCallbackBlocked() public {
        AdversarialToken bad = new AdversarialToken(); PaymentGuard target = deploy(address(bad)); bad.transfer(address(target), 300_000e6);
        PaymentGuard.Payment memory p = payment(); p.token = address(bad); p.policyId = target.policyId();
        PaymentGuard.Payment memory nested = payment(); nested.token = address(bad); nested.policyId = target.policyId(); nested.invoiceKey = bytes32(uint256(100)); nested.authorizationNonce = 456;
        bad.configure(4, target, nested, sign(target, nested, KEY)); target.executePayment(p, sign(target, p, KEY));
        require(bad.callbackBlocked(), "callback not blocked"); eq(uint256(target.nonceState(456)), 0); eq(bad.balanceOf(RECIPIENT), 48_000e6);
    }
    function testConstructorInvalidConfigurations() public {
        vm.expectRevert(PaymentGuard.InvalidConfiguration.selector); new PaymentGuard(address(0), signer, 1, 600, keys, recipients);
        vm.expectRevert(PaymentGuard.InvalidConfiguration.selector); new PaymentGuard(address(0xABC), signer, 1, 600, keys, recipients);
        vm.expectRevert(PaymentGuard.InvalidConfiguration.selector); new PaymentGuard(address(token), address(0), 1, 600, keys, recipients);
        vm.expectRevert(PaymentGuard.InvalidConfiguration.selector); new PaymentGuard(address(token), signer, 0, 600, keys, recipients);
        vm.expectRevert(PaymentGuard.InvalidConfiguration.selector); new PaymentGuard(address(token), signer, 1, 0, keys, recipients);
        vm.expectRevert(PaymentGuard.InvalidConfiguration.selector); new PaymentGuard(address(token), signer, 1, 601, keys, recipients);
        WrongDecimals wrong = new WrongDecimals(); vm.expectRevert(PaymentGuard.InvalidConfiguration.selector); deploy(address(wrong));
    }
    function testRegistryOrderingAndInvalidEntries() public {
        bytes32[] memory k = new bytes32[](0); address[] memory r = new address[](0);
        vm.expectRevert(PaymentGuard.InvalidRegistry.selector); new PaymentGuard(address(token), signer, 1, 600, k, r);
        k = new bytes32[](2); r = new address[](2); k[0] = bytes32(uint256(2)); k[1] = bytes32(uint256(1)); r[0] = RECIPIENT; r[1] = address(0xC);
        vm.expectRevert(PaymentGuard.InvalidRegistry.selector); new PaymentGuard(address(token), signer, 1, 600, k, r);
        k[0] = k[1]; vm.expectRevert(PaymentGuard.InvalidRegistry.selector); new PaymentGuard(address(token), signer, 1, 600, k, r);
        k[0] = bytes32(0); vm.expectRevert(PaymentGuard.InvalidRegistry.selector); new PaymentGuard(address(token), signer, 1, 600, k, r);
        k[0] = bytes32(uint256(1)); k[1] = bytes32(uint256(2)); r[1] = address(0);
        vm.expectRevert(PaymentGuard.InvalidRegistry.selector); new PaymentGuard(address(token), signer, 1, 600, k, r);
        k = new bytes32[](33); r = new address[](33); vm.expectRevert(PaymentGuard.InvalidRegistry.selector); new PaymentGuard(address(token), signer, 1, 600, k, r);
        r = new address[](1); vm.expectRevert(PaymentGuard.InvalidRegistry.selector); new PaymentGuard(address(token), signer, 1, 600, keys, new address[](2));
    }
    function testRegistryRejectsVaultAsRecipient() public {
        address[] memory r = new address[](1); r[0] = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        vm.expectRevert(PaymentGuard.InvalidRegistry.selector); new PaymentGuard(address(token), signer, 1, 600, keys, r);
    }
    function testFuzzAmountExact(uint256 candidate) public {
        PaymentGuard.Payment memory p = payment(); p.amountAtomic = candidate % 50_000e6 + 1;
        execute(p); eq(token.balanceOf(RECIPIENT), p.amountAtomic); eq(token.balanceOf(address(guard)), 300_000e6 - p.amountAtomic);
    }
}

contract PaymentHandler is TestBase {
    PaymentGuard public guard;
    DemoToken public token;
    uint256 public successfulTransfers;
    mapping(bytes32 => uint256) public count;
    mapping(uint256 => bool) public paidNonces;
    uint256 private constant KEY = 0xA11CE;
    constructor(PaymentGuard g, DemoToken t) { guard = g; token = t; }
    function attempt(uint8 invoice, uint8 nonce, bool invalidSigner) external {
        bytes32 key = bytes32(uint256(invoice % 8) + 1);
        PaymentGuard.Payment memory p = PaymentGuard.Payment(key, bytes32(uint256(1)), address(0xB0B), address(token), 1e6,
            uint256(nonce) + 1, uint64(block.timestamp), uint64(block.timestamp + 600), keccak256("invariant"), guard.policyId());
        bytes memory sig = sign(guard, p, invalidSigner ? 7 : KEY);
        try guard.executePayment(p, sig) { count[key]++; successfulTransfers++; paidNonces[p.authorizationNonce] = true; } catch {}
    }
    function cancel(uint8 nonce) external { vm.prank(vm.addr(KEY)); try guard.cancelNonce(uint256(nonce) + 1) {} catch {} }
}

contract PaymentGuardInvariantTest is TestBase {
    PaymentHandler internal handler;
    PaymentGuard internal guard;
    DemoToken internal token;
    address[] internal targets;
    function setUp() public {
        vm.warp(1_800_000_000);
        token = new DemoToken(address(this)); bytes32[] memory keys = new bytes32[](1); keys[0] = bytes32(uint256(1));
        address[] memory recipients = new address[](1); recipients[0] = address(0xB0B);
        guard = new PaymentGuard(address(token), vm.addr(0xA11CE), 50_000e6, 600, keys, recipients);
        token.transfer(address(guard), 300_000e6); handler = new PaymentHandler(guard, token); targets.push(address(handler));
    }
    function targetContracts() external view returns (address[] memory) { return targets; }
    function invariant_oneSettlementPerInvoiceAndExactConservation() public view {
        uint256 count;
        for (uint256 i = 1; i <= 8; i++) {
            bytes32 key = bytes32(i); uint256 successes = handler.count(key); require(successes <= 1, "duplicate settlement");
            require((guard.invoiceSettlementDigest(key) != bytes32(0)) == (successes == 1), "settlement consumption mismatch"); count += successes;
        }
        eq(handler.successfulTransfers(), count); eq(token.balanceOf(address(0xB0B)), count * 1e6);
        eq(token.balanceOf(address(guard)), 300_000e6 - count * 1e6);
        for (uint256 i = 1; i <= 256; i++) require((guard.nonceState(i) == PaymentGuard.NonceState.Executed) == handler.paidNonces(i), "nonce consumption mismatch");
    }
}
