// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BossJobEscrow} from "../src/BossJobEscrow.sol";

/// @dev ERC20 that re-enters BossJobEscrow.fund during transferFrom (callback-style).
contract ReentrantToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    BossJobEscrow public target;
    uint256 public reenterJobId;
    uint256 public reenterBudget;
    bool public reentered;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function configureReenter(BossJobEscrow escrow_, uint256 jobId, uint256 budget) external {
        target = escrow_;
        reenterJobId = jobId;
        reenterBudget = budget;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        if (!reentered && address(target) != address(0) && to == address(target)) {
            reentered = true;
            // Attempt double-fund; must fail because status is already Funded (CEI).
            try target.fund(reenterJobId, reenterBudget) {} catch {}
        }
        return true;
    }
}
