// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Valueless synthetic demo asset. The constructor is the only mint route.
contract DemoToken is ERC20 {
    constructor(address funder) ERC20("Secure Finance Demo", "DEMO") {
        _mint(funder, 1_000_000 * 10 ** 6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
