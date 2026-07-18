// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BossBountyEscrow} from "../src/BossBountyEscrow.sol";
import {MockERC20} from "./MockERC20.sol";
import {FeeOnTransferToken} from "./FeeOnTransferToken.sol";

contract BossBountyEscrowTest is Test {
    MockERC20 token;
    BossBountyEscrow escrow;
    address operator = address(0x0B);
    address poster = address(0xB0);
    address provider = address(0xB1);
    address stranger = address(0x55);

    uint256 biddingDeadline;
    uint256 awardDeadline;
    uint256 deliveryDeadline;
    uint256 acceptDeadline;

    function setUp() public {
        token = new MockERC20();
        escrow = new BossBountyEscrow(address(token), operator);
        token.mint(poster, 1_000_000e6);
        token.mint(operator, 1_000_000e6);
        vm.prank(poster);
        token.approve(address(escrow), type(uint256).max);
        vm.prank(operator);
        token.approve(address(escrow), type(uint256).max);

        biddingDeadline = block.timestamp + 1 days;
        awardDeadline = block.timestamp + 2 days;
        deliveryDeadline = block.timestamp + 3 days;
        acceptDeadline = block.timestamp + 4 days;
    }

    function _createFundAwardDeliver() internal returns (uint256 bountyId, uint256 awardId) {
        vm.prank(poster);
        bountyId = escrow.createBounty(
            100e6,
            biddingDeadline,
            awardDeadline,
            deliveryDeadline,
            acceptDeadline,
            "ipfs://meta"
        );
        vm.prank(poster);
        escrow.fundBounty(bountyId, 100e6);
        vm.prank(poster);
        awardId = escrow.createAward(bountyId, provider, 100e6);
        vm.prank(provider);
        escrow.submitDelivery(awardId, bytes32(uint256(42)));
    }

    function test_acceptAward_poster_only() public {
        (, uint256 awardId) = _createFundAwardDeliver();
        vm.prank(stranger);
        vm.expectRevert(bytes("only poster"));
        escrow.acceptAward(awardId);

        vm.prank(poster);
        escrow.acceptAward(awardId);
        assertEq(token.balanceOf(provider), 100e6);
    }

    function test_claimPayout_after_accept_deadline_permissionless() public {
        (, uint256 awardId) = _createFundAwardDeliver();
        vm.warp(acceptDeadline);
        vm.prank(stranger);
        escrow.claimPayout(awardId);
        assertEq(token.balanceOf(provider), 100e6);
    }

    function test_claimPayout_before_deadline_reverts() public {
        (, uint256 awardId) = _createFundAwardDeliver();
        vm.prank(stranger);
        vm.expectRevert(bytes("accept window open"));
        escrow.claimPayout(awardId);
    }

    function test_submitDelivery_after_deadline_reverts() public {
        vm.prank(poster);
        uint256 bountyId = escrow.createBounty(
            50e6,
            biddingDeadline,
            awardDeadline,
            deliveryDeadline,
            acceptDeadline,
            "meta"
        );
        vm.prank(poster);
        escrow.fundBounty(bountyId, 50e6);
        vm.prank(poster);
        uint256 awardId = escrow.createAward(bountyId, provider, 50e6);

        vm.warp(deliveryDeadline + 1);
        vm.prank(provider);
        vm.expectRevert(bytes("delivery window closed"));
        escrow.submitDelivery(awardId, bytes32(uint256(1)));
    }

    function test_award_stores_bountyId() public {
        (uint256 bountyId, uint256 awardId) = _createFundAwardDeliver();
        (uint256 storedBountyId, , , , , ) = escrow.awards(awardId);
        assertEq(storedBountyId, bountyId);
    }

    function test_operator_accept_on_behalf() public {
        (, uint256 awardId) = _createFundAwardDeliver();
        vm.prank(operator);
        escrow.acceptAwardOnBehalf(awardId);
        assertEq(token.balanceOf(provider), 100e6);
    }

    function test_constructor_rejects_zero() public {
        vm.expectRevert(bytes("token required"));
        new BossBountyEscrow(address(0), operator);
        vm.expectRevert(bytes("operator required"));
        new BossBountyEscrow(address(token), address(0));
    }

    function test_forfeit_undelivered_after_delivery_deadline() public {
        vm.prank(poster);
        uint256 bountyId = escrow.createBounty(
            100e6,
            biddingDeadline,
            awardDeadline,
            deliveryDeadline,
            acceptDeadline,
            "meta"
        );
        vm.prank(poster);
        escrow.fundBounty(bountyId, 100e6);
        vm.prank(poster);
        uint256 awardId = escrow.createAward(bountyId, provider, 40e6);

        (, , uint256 remainingBefore, , , , , , ) = escrow.bounties(bountyId);
        assertEq(remainingBefore, 60e6);

        vm.warp(deliveryDeadline + 1);
        vm.prank(poster);
        escrow.forfeitAward(awardId);

        (, , , , BossBountyEscrow.AwardStatus status, ) = escrow.awards(awardId);
        assertEq(uint256(status), uint256(BossBountyEscrow.AwardStatus.Forfeited));
        (, , uint256 remainingAfter, , , , , , ) = escrow.bounties(bountyId);
        assertEq(remainingAfter, 100e6);
    }

    function test_forfeit_before_deadline_reverts() public {
        vm.prank(poster);
        uint256 bountyId = escrow.createBounty(
            50e6,
            biddingDeadline,
            awardDeadline,
            deliveryDeadline,
            acceptDeadline,
            "meta"
        );
        vm.prank(poster);
        escrow.fundBounty(bountyId, 50e6);
        vm.prank(poster);
        uint256 awardId = escrow.createAward(bountyId, provider, 50e6);
        vm.prank(poster);
        vm.expectRevert(bytes("delivery open"));
        escrow.forfeitAward(awardId);
    }

    function test_fund_rejects_fee_on_transfer() public {
        FeeOnTransferToken fot = new FeeOnTransferToken();
        BossBountyEscrow fotEscrow = new BossBountyEscrow(address(fot), operator);
        fot.mint(poster, 1_000_000e6);
        vm.prank(poster);
        fot.approve(address(fotEscrow), type(uint256).max);

        vm.prank(poster);
        uint256 bountyId = fotEscrow.createBounty(
            100e6,
            biddingDeadline,
            awardDeadline,
            deliveryDeadline,
            acceptDeadline,
            "meta"
        );
        vm.prank(poster);
        vm.expectRevert(bytes("amount mismatch"));
        fotEscrow.fundBounty(bountyId, 100e6);
    }

    function test_operator_two_step_transfer() public {
        address nextOp = address(0x0E);
        vm.prank(operator);
        escrow.transferOperator(nextOp);
        assertEq(escrow.pendingOperator(), nextOp);
        assertEq(escrow.operator(), operator);

        vm.prank(stranger);
        vm.expectRevert(bytes("only pending"));
        escrow.acceptOperator();

        vm.prank(nextOp);
        escrow.acceptOperator();
        assertEq(escrow.operator(), nextOp);
        assertEq(escrow.pendingOperator(), address(0));

        // Old operator loses rights
        vm.prank(operator);
        vm.expectRevert(bytes("only operator"));
        escrow.transferOperator(operator);
    }

    /// @dev F-1: partial award leaves remainingBudget; after awardDeadline poster can reclaim leftover.
    function test_refundUnawarded_leftover_after_partial_award() public {
        vm.prank(poster);
        uint256 bountyId = escrow.createBounty(
            100e6,
            biddingDeadline,
            awardDeadline,
            deliveryDeadline,
            acceptDeadline,
            "meta"
        );
        vm.prank(poster);
        escrow.fundBounty(bountyId, 100e6);
        vm.prank(poster);
        uint256 awardId = escrow.createAward(bountyId, provider, 40e6);

        // Before awardDeadline: leftover refund blocked
        vm.prank(stranger);
        vm.expectRevert(bytes("award window open"));
        escrow.refundUnawarded(bountyId);

        vm.warp(awardDeadline + 1);
        uint256 posterBefore = token.balanceOf(poster);
        escrow.refundUnawarded(bountyId);
        assertEq(token.balanceOf(poster), posterBefore + 60e6);

        (, , uint256 remaining, , , , , BossBountyEscrow.BountyStatus status, ) = escrow.bounties(
            bountyId
        );
        assertEq(remaining, 0);
        // Outstanding awards remain; status stays Awarded (not full Refunded)
        assertEq(uint256(status), uint256(BossBountyEscrow.BountyStatus.Awarded));

        // Locked award amount still payable after delivery
        vm.prank(provider);
        escrow.submitDelivery(awardId, bytes32(uint256(7)));
        vm.prank(poster);
        escrow.acceptAward(awardId);
        assertEq(token.balanceOf(provider), 40e6);
    }

    function test_refundUnawarded_funded_after_bidding() public {
        vm.prank(poster);
        uint256 bountyId = escrow.createBounty(
            80e6,
            biddingDeadline,
            awardDeadline,
            deliveryDeadline,
            acceptDeadline,
            "meta"
        );
        vm.prank(poster);
        escrow.fundBounty(bountyId, 80e6);

        vm.warp(biddingDeadline + 1);
        uint256 posterBefore = token.balanceOf(poster);
        escrow.refundUnawarded(bountyId);
        assertEq(token.balanceOf(poster), posterBefore + 80e6);

        (, , uint256 remaining, , , , , BossBountyEscrow.BountyStatus status, ) = escrow.bounties(
            bountyId
        );
        assertEq(remaining, 0);
        assertEq(uint256(status), uint256(BossBountyEscrow.BountyStatus.Refunded));
    }

    function test_forfeit_then_refund_restores_full_budget() public {
        vm.prank(poster);
        uint256 bountyId = escrow.createBounty(
            100e6,
            biddingDeadline,
            awardDeadline,
            deliveryDeadline,
            acceptDeadline,
            "meta"
        );
        vm.prank(poster);
        escrow.fundBounty(bountyId, 100e6);
        vm.prank(poster);
        uint256 awardId = escrow.createAward(bountyId, provider, 100e6);

        vm.warp(deliveryDeadline + 1);
        vm.prank(poster);
        escrow.forfeitAward(awardId);

        // Full forfeit returns status to Funded
        (, , uint256 remaining, , , , , BossBountyEscrow.BountyStatus status, ) = escrow.bounties(
            bountyId
        );
        assertEq(remaining, 100e6);
        assertEq(uint256(status), uint256(BossBountyEscrow.BountyStatus.Funded));

        // biddingDeadline already passed via warp; refund full pot
        uint256 posterBefore = token.balanceOf(poster);
        escrow.refundUnawarded(bountyId);
        assertEq(token.balanceOf(poster), posterBefore + 100e6);
    }

    /// @dev F-7: anyone may forfeit undelivered awards after deliveryDeadline.
    function test_forfeit_permissionless_after_delivery_deadline() public {
        vm.prank(poster);
        uint256 bountyId = escrow.createBounty(
            50e6,
            biddingDeadline,
            awardDeadline,
            deliveryDeadline,
            acceptDeadline,
            "meta"
        );
        vm.prank(poster);
        escrow.fundBounty(bountyId, 50e6);
        vm.prank(poster);
        uint256 awardId = escrow.createAward(bountyId, provider, 50e6);

        vm.prank(stranger);
        vm.expectRevert(bytes("delivery open"));
        escrow.forfeitAward(awardId);

        vm.warp(deliveryDeadline + 1);
        vm.prank(stranger);
        escrow.forfeitAward(awardId);

        (, , , , BossBountyEscrow.AwardStatus status, ) = escrow.awards(awardId);
        assertEq(uint256(status), uint256(BossBountyEscrow.AwardStatus.Forfeited));
        (, , uint256 remaining, , , , , BossBountyEscrow.BountyStatus bStatus, ) = escrow.bounties(
            bountyId
        );
        assertEq(remaining, 50e6);
        assertEq(uint256(bStatus), uint256(BossBountyEscrow.BountyStatus.Funded));
    }

    function test_double_claim_reverts() public {
        (, uint256 awardId) = _createFundAwardDeliver();
        vm.warp(acceptDeadline);
        escrow.claimPayout(awardId);
        vm.expectRevert(bytes("not delivered"));
        escrow.claimPayout(awardId);
    }

    function test_double_accept_reverts() public {
        (, uint256 awardId) = _createFundAwardDeliver();
        vm.prank(poster);
        escrow.acceptAward(awardId);
        vm.prank(poster);
        vm.expectRevert(bytes("not delivered"));
        escrow.acceptAward(awardId);
    }

    function test_createAward_after_award_deadline_reverts() public {
        vm.prank(poster);
        uint256 bountyId = escrow.createBounty(
            40e6,
            biddingDeadline,
            awardDeadline,
            deliveryDeadline,
            acceptDeadline,
            "meta"
        );
        vm.prank(poster);
        escrow.fundBounty(bountyId, 40e6);
        vm.warp(awardDeadline + 1);
        vm.prank(poster);
        vm.expectRevert(bytes("award window closed"));
        escrow.createAward(bountyId, provider, 40e6);
    }

    function test_createAward_amount_exceeds_remaining_reverts() public {
        vm.prank(poster);
        uint256 bountyId = escrow.createBounty(
            40e6,
            biddingDeadline,
            awardDeadline,
            deliveryDeadline,
            acceptDeadline,
            "meta"
        );
        vm.prank(poster);
        escrow.fundBounty(bountyId, 40e6);
        vm.prank(poster);
        escrow.createAward(bountyId, provider, 30e6);
        vm.prank(poster);
        vm.expectRevert(bytes("amount invalid"));
        escrow.createAward(bountyId, provider, 20e6);
    }

    function test_partial_pay_then_leftover_refund_preserves_locked() public {
        address provider2 = address(0xB2);
        vm.prank(poster);
        uint256 bountyId = escrow.createBounty(
            100e6,
            biddingDeadline,
            awardDeadline,
            deliveryDeadline,
            acceptDeadline,
            "meta"
        );
        vm.prank(poster);
        escrow.fundBounty(bountyId, 100e6);
        vm.prank(poster);
        uint256 award1 = escrow.createAward(bountyId, provider, 40e6);
        vm.prank(poster);
        uint256 award2 = escrow.createAward(bountyId, provider2, 30e6);
        // remaining 30 unallocated

        vm.prank(provider);
        escrow.submitDelivery(award1, bytes32(uint256(1)));
        vm.prank(poster);
        escrow.acceptAward(award1);
        assertEq(token.balanceOf(provider), 40e6);

        uint256 escrowBal = token.balanceOf(address(escrow));
        // 30 remaining + 30 locked in award2
        assertEq(escrowBal, 60e6);

        vm.warp(awardDeadline + 1);
        uint256 posterBefore = token.balanceOf(poster);
        escrow.refundUnawarded(bountyId);
        assertEq(token.balanceOf(poster), posterBefore + 30e6);
        // award2 still locked
        assertEq(token.balanceOf(address(escrow)), 30e6);

        vm.prank(provider2);
        escrow.submitDelivery(award2, bytes32(uint256(2)));
        vm.warp(acceptDeadline);
        escrow.claimPayout(award2);
        assertEq(token.balanceOf(provider2), 30e6);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_operator_create_fund_on_behalf() public {
        vm.prank(operator);
        uint256 bountyId = escrow.createBountyOnBehalf(
            poster,
            25e6,
            biddingDeadline,
            awardDeadline,
            deliveryDeadline,
            acceptDeadline,
            "meta"
        );
        vm.prank(operator);
        escrow.fundBountyOnBehalf(bountyId);
        (, , uint256 remaining, , , , , BossBountyEscrow.BountyStatus status, ) = escrow.bounties(
            bountyId
        );
        assertEq(remaining, 25e6);
        assertEq(uint256(status), uint256(BossBountyEscrow.BountyStatus.Funded));

        vm.prank(stranger);
        vm.expectRevert(bytes("only operator"));
        escrow.createAwardOnBehalf(bountyId, provider, 25e6);
    }

    function test_createBounty_bad_deadlines_revert() public {
        vm.prank(poster);
        vm.expectRevert(bytes("deadlines ordered"));
        escrow.createBounty(
            10e6,
            biddingDeadline,
            deliveryDeadline,
            awardDeadline,
            acceptDeadline,
            "meta"
        );
    }

    function test_forfeit_delivered_reverts() public {
        (, uint256 awardId) = _createFundAwardDeliver();
        vm.warp(deliveryDeadline + 1);
        vm.expectRevert(bytes("not pending"));
        escrow.forfeitAward(awardId);
    }

    function test_fund_budget_mismatch_reverts() public {
        vm.prank(poster);
        uint256 bountyId = escrow.createBounty(
            10e6,
            biddingDeadline,
            awardDeadline,
            deliveryDeadline,
            acceptDeadline,
            "meta"
        );
        vm.prank(poster);
        vm.expectRevert(bytes("budget mismatch"));
        escrow.fundBounty(bountyId, 11e6);
    }
}
