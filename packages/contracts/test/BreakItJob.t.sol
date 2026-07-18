// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BossJobEscrow} from "../src/BossJobEscrow.sol";
import {MockERC20} from "./MockERC20.sol";

/// @dev Adversarial / edge-case campaign for BossJobEscrow before mainnet.
contract BreakItJobTest is Test {
    MockERC20 token;
    BossJobEscrow escrow;
    address client = address(0xC11E17);
    address provider = address(0xB201DE2);
    address evaluator = address(0xE4A10A70);
    address stranger = address(0x55);

    function setUp() public {
        token = new MockERC20();
        escrow = new BossJobEscrow(address(token));
        token.mint(client, 1_000_000e6);
        vm.prank(client);
        token.approve(address(escrow), type(uint256).max);
    }

    function _openFunded(uint256 budget, uint256 expiresAt) internal returns (uint256 jobId) {
        vm.prank(client);
        jobId = escrow.createJob(provider, evaluator, expiresAt, "task");
        vm.prank(client);
        escrow.setBudget(jobId, budget);
        vm.prank(client);
        escrow.fund(jobId, budget);
    }

    function test_reject_submitted_refunds_client_not_provider() public {
        uint256 jobId = _openFunded(50e6, block.timestamp + 1 days);
        vm.prank(provider);
        escrow.submit(jobId, bytes32(uint256(1)));
        uint256 clientBefore = token.balanceOf(client);
        uint256 providerBefore = token.balanceOf(provider);
        vm.prank(evaluator);
        escrow.reject(jobId, bytes32(uint256(2)));
        assertEq(token.balanceOf(client), clientBefore + 50e6);
        assertEq(token.balanceOf(provider), providerBefore);
    }

    function test_claimRefund_funded_never_submitted() public {
        uint256 expiresAt = block.timestamp + 1 hours;
        uint256 jobId = _openFunded(33e6, expiresAt);
        vm.warp(expiresAt);
        uint256 before = token.balanceOf(client);
        vm.prank(stranger);
        escrow.claimRefund(jobId);
        assertEq(token.balanceOf(client), before + 33e6);
    }

    function test_double_fund_reverts() public {
        uint256 jobId = _openFunded(10e6, block.timestamp + 1 days);
        vm.prank(client);
        vm.expectRevert(bytes("not open"));
        escrow.fund(jobId, 10e6);
    }

    function test_complete_then_claimRefund_reverts() public {
        uint256 expiresAt = block.timestamp + 1 days;
        uint256 jobId = _openFunded(20e6, expiresAt);
        vm.prank(provider);
        escrow.submit(jobId, bytes32(uint256(1)));
        vm.prank(evaluator);
        escrow.complete(jobId, bytes32(uint256(2)));
        vm.warp(expiresAt);
        vm.expectRevert(bytes("bad status"));
        escrow.claimRefund(jobId);
    }

    function test_complete_at_exact_expiry_reverts_claim_ok() public {
        uint256 expiresAt = block.timestamp + 100;
        uint256 jobId = _openFunded(20e6, expiresAt);
        vm.prank(provider);
        escrow.submit(jobId, bytes32(uint256(1)));
        vm.warp(expiresAt);
        vm.prank(evaluator);
        vm.expectRevert(bytes("expired"));
        escrow.complete(jobId, bytes32(uint256(1)));
        uint256 before = token.balanceOf(client);
        escrow.claimRefund(jobId);
        assertEq(token.balanceOf(client), before + 20e6);
    }

    function test_stranger_cannot_complete() public {
        uint256 jobId = _openFunded(10e6, block.timestamp + 1 days);
        vm.prank(provider);
        escrow.submit(jobId, bytes32(uint256(1)));
        vm.prank(stranger);
        vm.expectRevert(bytes("only evaluator"));
        escrow.complete(jobId, bytes32(uint256(1)));
    }

    function test_stranger_cannot_reject_funded() public {
        uint256 jobId = _openFunded(10e6, block.timestamp + 1 days);
        vm.prank(stranger);
        vm.expectRevert(bytes("only evaluator"));
        escrow.reject(jobId, bytes32(uint256(1)));
    }

    function test_client_reject_open_no_transfer() public {
        vm.prank(client);
        uint256 jobId = escrow.createJob(provider, evaluator, block.timestamp + 1 days, "x");
        uint256 bal = token.balanceOf(address(escrow));
        vm.prank(client);
        escrow.reject(jobId, bytes32(uint256(1)));
        assertEq(token.balanceOf(address(escrow)), bal);
    }

    function test_fund_with_exact_allowance() public {
        // reset approval to exact budget
        vm.prank(client);
        token.approve(address(escrow), 0);
        vm.prank(client);
        uint256 jobId = escrow.createJob(provider, evaluator, block.timestamp + 1 days, "x");
        vm.prank(client);
        escrow.setBudget(jobId, 7e6);
        vm.prank(client);
        token.approve(address(escrow), 7e6);
        vm.prank(client);
        escrow.fund(jobId, 7e6);
        (, , , uint256 budget, , , BossJobEscrow.Status st, ) = escrow.jobs(jobId);
        assertEq(budget, 7e6);
        assertEq(uint256(st), uint256(BossJobEscrow.Status.Funded));
    }

    function test_donation_does_not_change_job_payout() public {
        uint256 jobId = _openFunded(10e6, block.timestamp + 1 days);
        token.mint(address(escrow), 99e6); // donation
        vm.prank(provider);
        escrow.submit(jobId, bytes32(uint256(1)));
        uint256 before = token.balanceOf(provider);
        vm.prank(evaluator);
        escrow.complete(jobId, bytes32(uint256(1)));
        assertEq(token.balanceOf(provider), before + 10e6);
        // donation stranded in contract
        assertEq(token.balanceOf(address(escrow)), 99e6);
    }

    function test_double_submit_reverts() public {
        uint256 jobId = _openFunded(10e6, block.timestamp + 1 days);
        vm.prank(provider);
        escrow.submit(jobId, bytes32(uint256(1)));
        vm.prank(provider);
        vm.expectRevert(bytes("not funded"));
        escrow.submit(jobId, bytes32(uint256(2)));
    }

    function test_reject_open_by_stranger_reverts() public {
        vm.prank(client);
        uint256 jobId = escrow.createJob(provider, evaluator, block.timestamp + 1 days, "x");
        vm.prank(stranger);
        vm.expectRevert(bytes("only client"));
        escrow.reject(jobId, bytes32(uint256(1)));
    }
}
