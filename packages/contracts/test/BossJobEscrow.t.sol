// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BossJobEscrow} from "../src/BossJobEscrow.sol";
import {MockERC20} from "./MockERC20.sol";

contract BossJobEscrowTest is Test {
    MockERC20 token;
    BossJobEscrow escrow;
    address client = address(0xC11E17);
    address provider = address(0xB201DE2);
    address evaluator = address(0xE4A10A70);

    function setUp() public {
        token = new MockERC20();
        escrow = new BossJobEscrow(address(token));
        token.mint(client, 1_000_000e6);
        vm.prank(client);
        token.approve(address(escrow), type(uint256).max);
    }

    function _fundedSubmittedJob(uint256 budget, uint256 expiresAt) internal returns (uint256 jobId) {
        vm.prank(client);
        jobId = escrow.createJob(provider, evaluator, expiresAt, "task");
        vm.prank(client);
        escrow.setBudget(jobId, budget);
        vm.prank(client);
        escrow.fund(jobId, budget);
        vm.prank(provider);
        escrow.submit(jobId, bytes32(uint256(1)));
    }

    function test_complete_pays_provider_before_expiry() public {
        uint256 jobId = _fundedSubmittedJob(100e6, block.timestamp + 1 days);
        vm.prank(evaluator);
        escrow.complete(jobId, bytes32(uint256(2)));
        assertEq(token.balanceOf(provider), 100e6);
    }

    function test_complete_reverts_after_expiry() public {
        uint256 expiresAt = block.timestamp + 1 hours;
        uint256 jobId = _fundedSubmittedJob(100e6, expiresAt);
        vm.warp(expiresAt);
        vm.prank(evaluator);
        vm.expectRevert(bytes("expired"));
        escrow.complete(jobId, bytes32(uint256(2)));
    }

    function test_submit_reverts_after_expiry() public {
        uint256 expiresAt = block.timestamp + 1 hours;
        vm.prank(client);
        uint256 jobId = escrow.createJob(provider, evaluator, expiresAt, "task");
        vm.prank(client);
        escrow.setBudget(jobId, 50e6);
        vm.prank(client);
        escrow.fund(jobId, 50e6);
        vm.warp(expiresAt);
        vm.prank(provider);
        vm.expectRevert(bytes("expired"));
        escrow.submit(jobId, bytes32(uint256(1)));
    }

    function test_claimRefund_after_expiry_when_submitted() public {
        uint256 expiresAt = block.timestamp + 1 hours;
        uint256 jobId = _fundedSubmittedJob(100e6, expiresAt);
        vm.warp(expiresAt);
        uint256 before = token.balanceOf(client);
        escrow.claimRefund(jobId);
        assertEq(token.balanceOf(client), before + 100e6);
    }

    function test_constructor_rejects_zero_token() public {
        vm.expectRevert(bytes("token required"));
        new BossJobEscrow(address(0));
    }
}
