// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BossBountyEscrow} from "../src/BossBountyEscrow.sol";
import {MockERC20} from "./MockERC20.sol";

/// @dev Adversarial / edge-case campaign for BossBountyEscrow before mainnet.
contract BreakItBountyTest is Test {
    MockERC20 token;
    BossBountyEscrow escrow;
    address operator = address(0x0B);
    address poster = address(0xB0);
    address provider = address(0xB1);
    address provider2 = address(0xB2);
    address provider3 = address(0xB3);
    address stranger = address(0x55);

    uint256 biddingDeadline;
    uint256 awardDeadline;
    uint256 deliveryDeadline;
    uint256 acceptDeadline;

    function setUp() public {
        token = new MockERC20();
        escrow = new BossBountyEscrow(address(token), operator);
        token.mint(poster, 10_000_000e6);
        token.mint(operator, 10_000_000e6);
        token.mint(stranger, 1_000_000e6);
        vm.prank(poster);
        token.approve(address(escrow), type(uint256).max);
        vm.prank(operator);
        token.approve(address(escrow), type(uint256).max);

        biddingDeadline = block.timestamp + 1 days;
        awardDeadline = block.timestamp + 2 days;
        deliveryDeadline = block.timestamp + 3 days;
        acceptDeadline = block.timestamp + 4 days;
    }

    function _createFund(uint256 budget) internal returns (uint256 bountyId) {
        vm.prank(poster);
        bountyId = escrow.createBounty(
            budget,
            biddingDeadline,
            awardDeadline,
            deliveryDeadline,
            acceptDeadline,
            "meta"
        );
        vm.prank(poster);
        escrow.fundBounty(bountyId, budget);
    }

    function _liability(uint256 bountyId) internal view returns (uint256) {
        (, , uint256 remaining, , , , , , ) = escrow.bounties(bountyId);
        uint256 locked;
        // Walk award ids 1..nextAwardId (small in tests)
        uint256 n = escrow.nextAwardId();
        for (uint256 id = 1; id <= n; id++) {
            (uint256 bid, , uint256 amount, , BossBountyEscrow.AwardStatus st, ) = escrow.awards(id);
            if (bid != bountyId) continue;
            if (
                st == BossBountyEscrow.AwardStatus.Pending ||
                st == BossBountyEscrow.AwardStatus.Delivered
            ) {
                locked += amount;
            }
        }
        return remaining + locked;
    }

    function _assertSolvent() internal view {
        uint256 bal = token.balanceOf(address(escrow));
        uint256 liab;
        uint256 n = escrow.nextBountyId();
        for (uint256 id = 1; id <= n; id++) {
            liab += _liability(id);
        }
        assertGe(bal, liab, "undercollateralized");
    }

    // --- A: economic ---

    function test_donation_cannot_inflate_claims() public {
        uint256 bountyId = _createFund(100e6);
        vm.prank(poster);
        uint256 awardId = escrow.createAward(bountyId, provider, 40e6);

        // Donate extra tokens to escrow
        vm.prank(stranger);
        token.transfer(address(escrow), 50e6);

        assertEq(_liability(bountyId), 100e6);
        assertEq(token.balanceOf(address(escrow)), 150e6);

        vm.prank(provider);
        escrow.submitDelivery(awardId, bytes32(uint256(1)));
        vm.prank(poster);
        escrow.acceptAward(awardId);
        // Provider only got 40e6, not donated 50
        assertEq(token.balanceOf(provider), 40e6);
        _assertSolvent();
    }

    function test_forfeit_after_paid_reverts() public {
        uint256 bountyId = _createFund(50e6);
        vm.prank(poster);
        uint256 awardId = escrow.createAward(bountyId, provider, 50e6);
        vm.prank(provider);
        escrow.submitDelivery(awardId, bytes32(uint256(1)));
        vm.prank(poster);
        escrow.acceptAward(awardId);

        vm.warp(deliveryDeadline + 1);
        vm.expectRevert(bytes("not pending"));
        escrow.forfeitAward(awardId);
    }

    function test_double_refund_reverts() public {
        uint256 bountyId = _createFund(80e6);
        vm.warp(biddingDeadline + 1);
        escrow.refundUnawarded(bountyId);
        // Full Funded refund flips status to Refunded (not merely remaining=0).
        vm.expectRevert(bytes("not refundable"));
        escrow.refundUnawarded(bountyId);
    }

    function test_double_leftover_refund_reverts_nothing() public {
        uint256 bountyId = _createFund(100e6);
        vm.prank(poster);
        uint256 awardId = escrow.createAward(bountyId, provider, 40e6);
        vm.prank(provider);
        escrow.submitDelivery(awardId, bytes32(uint256(1)));
        vm.prank(poster);
        escrow.acceptAward(awardId);
        // status stays Awarded; leftover 60
        vm.warp(awardDeadline + 1);
        escrow.refundUnawarded(bountyId);
        vm.expectRevert(bytes("nothing to refund"));
        escrow.refundUnawarded(bountyId);
    }

    function test_award_over_remaining_reverts() public {
        uint256 bountyId = _createFund(100e6);
        vm.prank(poster);
        escrow.createAward(bountyId, provider, 60e6);
        vm.prank(poster);
        vm.expectRevert(bytes("amount invalid"));
        escrow.createAward(bountyId, provider2, 50e6);
    }

    function test_dust_award_one_atomic() public {
        uint256 bountyId = _createFund(100e6);
        vm.prank(poster);
        uint256 awardId = escrow.createAward(bountyId, provider, 1);
        assertEq(_liability(bountyId), 100e6);
        vm.prank(provider);
        escrow.submitDelivery(awardId, bytes32(uint256(9)));
        vm.prank(poster);
        escrow.acceptAward(awardId);
        assertEq(token.balanceOf(provider), 1);
        _assertSolvent();
    }

    function test_chaos_pay_forfeit_leftover_conservation() public {
        uint256 bountyId = _createFund(100e6);
        vm.prank(poster);
        uint256 a1 = escrow.createAward(bountyId, provider, 40e6);
        vm.prank(poster);
        uint256 a2 = escrow.createAward(bountyId, provider2, 30e6);
        // remaining 30 unallocated

        vm.prank(provider);
        escrow.submitDelivery(a1, bytes32(uint256(1)));
        vm.prank(poster);
        escrow.acceptAward(a1); // pay 40

        vm.warp(deliveryDeadline + 1);
        escrow.forfeitAward(a2); // 30 back to remaining → remaining 60

        assertEq(_liability(bountyId), 60e6);
        _assertSolvent();

        // award window already closed (delivery > award)
        uint256 posterBefore = token.balanceOf(poster);
        escrow.refundUnawarded(bountyId);
        assertEq(token.balanceOf(poster), posterBefore + 60e6);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_never_award_full_refund_after_bidding() public {
        uint256 bountyId = _createFund(77e6);
        vm.warp(biddingDeadline + 1);
        uint256 before = token.balanceOf(poster);
        vm.prank(stranger); // permissionless
        escrow.refundUnawarded(bountyId);
        assertEq(token.balanceOf(poster), before + 77e6);
    }

    // --- B: deadline boundaries ---

    function test_claimPayout_at_exact_accept_deadline() public {
        uint256 bountyId = _createFund(20e6);
        vm.prank(poster);
        uint256 awardId = escrow.createAward(bountyId, provider, 20e6);
        vm.prank(provider);
        escrow.submitDelivery(awardId, bytes32(uint256(1)));
        vm.warp(acceptDeadline);
        vm.prank(stranger);
        escrow.claimPayout(awardId);
        assertEq(token.balanceOf(provider), 20e6);
    }

    function test_submit_at_exact_delivery_deadline() public {
        uint256 bountyId = _createFund(20e6);
        vm.prank(poster);
        uint256 awardId = escrow.createAward(bountyId, provider, 20e6);
        vm.warp(deliveryDeadline);
        vm.prank(provider);
        escrow.submitDelivery(awardId, bytes32(uint256(1)));
        (, , , , BossBountyEscrow.AwardStatus st, ) = escrow.awards(awardId);
        assertEq(uint256(st), uint256(BossBountyEscrow.AwardStatus.Delivered));
    }

    function test_forfeit_at_exact_delivery_deadline_reverts() public {
        uint256 bountyId = _createFund(20e6);
        vm.prank(poster);
        uint256 awardId = escrow.createAward(bountyId, provider, 20e6);
        vm.warp(deliveryDeadline);
        vm.expectRevert(bytes("delivery open"));
        escrow.forfeitAward(awardId);
    }

    function test_createAward_at_exact_award_deadline() public {
        uint256 bountyId = _createFund(20e6);
        vm.warp(awardDeadline);
        vm.prank(poster);
        uint256 awardId = escrow.createAward(bountyId, provider, 20e6);
        assertGt(awardId, 0);
    }

    function test_bidding_at_exact_now_reverts() public {
        vm.prank(poster);
        vm.expectRevert(bytes("bidding in future"));
        escrow.createBounty(
            10e6,
            block.timestamp,
            block.timestamp + 1,
            block.timestamp + 2,
            block.timestamp + 3,
            "x"
        );
    }

    // --- C: access ---

    function test_stranger_fund_reverts() public {
        vm.prank(poster);
        uint256 bountyId = escrow.createBounty(
            10e6,
            biddingDeadline,
            awardDeadline,
            deliveryDeadline,
            acceptDeadline,
            "x"
        );
        vm.prank(stranger);
        token.approve(address(escrow), type(uint256).max);
        vm.prank(stranger);
        vm.expectRevert(bytes("only poster"));
        escrow.fundBounty(bountyId, 10e6);
    }

    function test_claimPayout_pays_provider_not_claimer() public {
        uint256 bountyId = _createFund(15e6);
        vm.prank(poster);
        uint256 awardId = escrow.createAward(bountyId, provider, 15e6);
        vm.prank(provider);
        escrow.submitDelivery(awardId, bytes32(uint256(1)));
        vm.warp(acceptDeadline);
        uint256 strangerBefore = token.balanceOf(stranger);
        uint256 providerBefore = token.balanceOf(provider);
        vm.prank(stranger);
        escrow.claimPayout(awardId);
        assertEq(token.balanceOf(stranger), strangerBefore);
        assertEq(token.balanceOf(provider), providerBefore + 15e6);
    }

    function test_refund_pays_poster_not_caller() public {
        uint256 bountyId = _createFund(12e6);
        vm.warp(biddingDeadline + 1);
        uint256 strangerBefore = token.balanceOf(stranger);
        uint256 posterBefore = token.balanceOf(poster);
        vm.prank(stranger);
        escrow.refundUnawarded(bountyId);
        assertEq(token.balanceOf(stranger), strangerBefore);
        assertEq(token.balanceOf(poster), posterBefore + 12e6);
    }

    function test_old_operator_loses_on_behalf_after_rotation() public {
        address nextOp = address(0x0E);
        token.mint(nextOp, 1_000_000e6);
        vm.prank(nextOp);
        token.approve(address(escrow), type(uint256).max);

        vm.prank(operator);
        escrow.transferOperator(nextOp);
        vm.prank(nextOp);
        escrow.acceptOperator();

        vm.prank(operator);
        vm.expectRevert(bytes("only operator"));
        escrow.createBountyOnBehalf(
            poster,
            10e6,
            biddingDeadline,
            awardDeadline,
            deliveryDeadline,
            acceptDeadline,
            "x"
        );
    }

    // --- E: multi-award chaos ---

    function test_three_awards_pay_forfeit_leftover() public {
        uint256 bountyId = _createFund(100e6);
        vm.prank(poster);
        uint256 a1 = escrow.createAward(bountyId, provider, 40e6);
        vm.prank(poster);
        uint256 a2 = escrow.createAward(bountyId, provider2, 25e6);
        vm.prank(poster);
        uint256 a3 = escrow.createAward(bountyId, provider3, 20e6);
        // remaining 15

        vm.prank(provider);
        escrow.submitDelivery(a1, bytes32(uint256(1)));
        vm.prank(poster);
        escrow.acceptAward(a1);

        vm.warp(deliveryDeadline + 1);
        escrow.forfeitAward(a2); // +25 remaining = 40
        // a3 still pending locked 20; free 40

        assertEq(_liability(bountyId), 60e6); // 40 free + 20 locked
        _assertSolvent();

        uint256 posterBefore = token.balanceOf(poster);
        escrow.refundUnawarded(bountyId);
        assertEq(token.balanceOf(poster), posterBefore + 40e6);
        // a3 still locked
        assertEq(token.balanceOf(address(escrow)), 20e6);

        escrow.forfeitAward(a3);
        escrow.refundUnawarded(bountyId);
        assertEq(token.balanceOf(address(escrow)), 0);
        _assertSolvent();
    }

    function test_full_forfeit_cannot_reaward_after_window() public {
        uint256 bountyId = _createFund(50e6);
        vm.prank(poster);
        uint256 awardId = escrow.createAward(bountyId, provider, 50e6);
        vm.warp(deliveryDeadline + 1);
        escrow.forfeitAward(awardId);
        (, , , , , , , BossBountyEscrow.BountyStatus st, ) = escrow.bounties(bountyId);
        assertEq(uint256(st), uint256(BossBountyEscrow.BountyStatus.Funded));

        vm.prank(poster);
        vm.expectRevert(bytes("award window closed"));
        escrow.createAward(bountyId, provider, 50e6);

        // must refund
        escrow.refundUnawarded(bountyId);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_createAward_after_refund_reverts() public {
        uint256 bountyId = _createFund(30e6);
        vm.warp(biddingDeadline + 1);
        escrow.refundUnawarded(bountyId);
        vm.prank(poster);
        vm.expectRevert(bytes("not fundable"));
        escrow.createAward(bountyId, provider, 1e6);
    }

    function test_award_zero_provider_reverts() public {
        uint256 bountyId = _createFund(10e6);
        vm.prank(poster);
        vm.expectRevert(bytes("provider required"));
        escrow.createAward(bountyId, address(0), 10e6);
    }

    function test_double_claim_and_accept_reverts() public {
        uint256 bountyId = _createFund(10e6);
        vm.prank(poster);
        uint256 awardId = escrow.createAward(bountyId, provider, 10e6);
        vm.prank(provider);
        escrow.submitDelivery(awardId, bytes32(uint256(1)));
        vm.prank(poster);
        escrow.acceptAward(awardId);
        vm.prank(poster);
        vm.expectRevert(bytes("not delivered"));
        escrow.acceptAward(awardId);
        vm.warp(acceptDeadline);
        vm.expectRevert(bytes("not delivered"));
        escrow.claimPayout(awardId);
    }

    function test_solvent_after_operator_on_behalf_lifecycle() public {
        vm.prank(operator);
        uint256 bountyId = escrow.createBountyOnBehalf(
            poster,
            90e6,
            biddingDeadline,
            awardDeadline,
            deliveryDeadline,
            acceptDeadline,
            "op"
        );
        vm.prank(operator);
        escrow.fundBountyOnBehalf(bountyId);
        vm.prank(operator);
        uint256 awardId = escrow.createAwardOnBehalf(bountyId, provider, 90e6);
        vm.prank(operator);
        escrow.submitDeliveryOnBehalf(awardId, bytes32(uint256(7)));
        vm.prank(operator);
        escrow.acceptAwardOnBehalf(awardId);
        assertEq(token.balanceOf(provider), 90e6);
        assertEq(token.balanceOf(address(escrow)), 0);
        _assertSolvent();
    }
}
