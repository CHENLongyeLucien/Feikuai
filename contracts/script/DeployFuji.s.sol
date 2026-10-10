// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {DemoToken} from "../src/DemoToken.sol";
import {PaymentGuard} from "../src/PaymentGuard.sol";

interface ScriptVm {
    function envAddress(string calldata) external returns(address);
    function startBroadcast(address) external;
    function stopBroadcast() external;
}
/// @dev The caller must use an encrypted named Foundry keystore. No application key is read.
contract DeployFuji {
    ScriptVm constant vm=ScriptVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    function run() external {
        require(block.chainid==43113,"Fuji only");
        address deployer=vm.envAddress("FUJI_DEPLOYER_ADDRESS");address approver=vm.envAddress("FUJI_APPROVER_ADDRESS");
        address relayer=vm.envAddress("FUJI_RELAYER_ADDRESS");address supplier1=vm.envAddress("FUJI_SUPPLIER_1_ADDRESS");address supplier2=vm.envAddress("FUJI_SUPPLIER_2_ADDRESS");
        address[5] memory roles=[deployer,approver,relayer,supplier1,supplier2];
        for(uint256 i;i<roles.length;++i){require(roles[i]!=address(0),"zero role");for(uint256 j;j<i;++j)require(roles[i]!=roles[j],"role collision");}
        bytes32[] memory keys=new bytes32[](2);address[] memory recipients=new address[](2);
        keys[0]=keccak256("northstar-supplier-1");keys[1]=keccak256("northstar-supplier-2");recipients[0]=supplier1;recipients[1]=supplier2;
        if(keys[0]>keys[1]){(keys[0],keys[1])=(keys[1],keys[0]);(recipients[0],recipients[1])=(recipients[1],recipients[0]);}
        vm.startBroadcast(deployer);
        DemoToken token=new DemoToken(deployer);
        PaymentGuard guard=new PaymentGuard(address(token),approver,50_000e6,600,keys,recipients);
        token.transfer(address(guard),300_000e6);
        vm.stopBroadcast();
    }
}
