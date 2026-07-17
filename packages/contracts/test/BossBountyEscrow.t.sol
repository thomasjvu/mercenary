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
}
