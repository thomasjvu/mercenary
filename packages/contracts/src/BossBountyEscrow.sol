// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
}

/// @notice Multi-award bounty escrow with permissionless payout after accept deadline.
contract BossBountyEscrow {
    enum BountyStatus {
        Open,
        Funded,
        Awarded,
        Completed,
        Refunded,
        Expired
    }

    enum AwardStatus {
        Pending,
        Delivered,
        Paid,
        Forfeited
    }

    struct Bounty {
        address poster;
        uint256 totalBudget;
        uint256 remainingBudget;
        uint256 biddingDeadline;
        uint256 awardDeadline;
        uint256 deliveryDeadline;
        uint256 acceptDeadline;
        BountyStatus status;
        string metadataUri;
    }

    struct Award {
        address provider;
        uint256 amount;
        bytes32 deliveryHash;
        AwardStatus status;
        uint256 deliveredAt;
    }

    IERC20Minimal public immutable token;
    uint256 public nextBountyId;
    mapping(uint256 => Bounty) public bounties;
    mapping(uint256 => uint256[]) public bountyAwardIds;
    mapping(uint256 => Award) public awards;
    uint256 public nextAwardId;

    event BountyCreated(uint256 indexed bountyId, address indexed poster, uint256 totalBudget);
    event BountyFunded(uint256 indexed bountyId, uint256 amount);
    event AwardCreated(uint256 indexed bountyId, uint256 indexed awardId, address indexed provider, uint256 amount);
    event DeliverySubmitted(uint256 indexed awardId, bytes32 deliveryHash);
    event AwardAccepted(uint256 indexed awardId, address indexed payer, uint256 amount);
    event AwardClaimed(uint256 indexed awardId, address indexed claimant, uint256 amount);
    event BountyRefunded(uint256 indexed bountyId, address indexed poster, uint256 amount);

    constructor(address token_) {
        token = IERC20Minimal(token_);
    }

    function createBounty(
        uint256 totalBudget,
        uint256 biddingDeadline,
        uint256 awardDeadline,
        uint256 deliveryDeadline,
        uint256 acceptDeadline,
        string calldata metadataUri
    ) external returns (uint256 bountyId) {
        require(totalBudget > 0, "budget required");
        require(acceptDeadline > deliveryDeadline, "deadlines ordered");
        require(deliveryDeadline > awardDeadline, "deadlines ordered");
        require(awardDeadline > biddingDeadline, "deadlines ordered");
        require(biddingDeadline > block.timestamp, "bidding in future");

        bountyId = ++nextBountyId;
        bounties[bountyId] = Bounty({
            poster: msg.sender,
            totalBudget: totalBudget,
            remainingBudget: 0,
            biddingDeadline: biddingDeadline,
            awardDeadline: awardDeadline,
            deliveryDeadline: deliveryDeadline,
            acceptDeadline: acceptDeadline,
            status: BountyStatus.Open,
            metadataUri: metadataUri
        });

        emit BountyCreated(bountyId, msg.sender, totalBudget);
    }

    function fundBounty(uint256 bountyId, uint256 expectedBudget) external {
        Bounty storage bounty = bounties[bountyId];
        require(msg.sender == bounty.poster, "only poster");
        require(bounty.status == BountyStatus.Open, "not open");
        require(bounty.totalBudget == expectedBudget, "budget mismatch");
        require(token.transferFrom(msg.sender, address(this), expectedBudget), "transfer failed");

        bounty.remainingBudget = expectedBudget;
        bounty.status = BountyStatus.Funded;
        emit BountyFunded(bountyId, expectedBudget);
    }

    function createAward(
        uint256 bountyId,
        address provider,
        uint256 amount
    ) external returns (uint256 awardId) {
        Bounty storage bounty = bounties[bountyId];
        require(msg.sender == bounty.poster, "only poster");
        require(
            bounty.status == BountyStatus.Funded || bounty.status == BountyStatus.Awarded,
            "not fundable"
        );
        require(block.timestamp <= bounty.awardDeadline, "award window closed");
        require(provider != address(0), "provider required");
        require(amount > 0 && amount <= bounty.remainingBudget, "amount invalid");

        awardId = ++nextAwardId;
        awards[awardId] = Award({
            provider: provider,
            amount: amount,
            deliveryHash: bytes32(0),
            status: AwardStatus.Pending,
            deliveredAt: 0
        });
        bountyAwardIds[bountyId].push(awardId);
        bounty.remainingBudget -= amount;
        bounty.status = BountyStatus.Awarded;

        emit AwardCreated(bountyId, awardId, provider, amount);
    }

    function submitDelivery(uint256 awardId, bytes32 deliveryHash) external {
        Award storage award = awards[awardId];
        require(msg.sender == award.provider, "only provider");
        require(award.status == AwardStatus.Pending, "not pending");
        require(deliveryHash != bytes32(0), "hash required");

        award.deliveryHash = deliveryHash;
        award.status = AwardStatus.Delivered;
        award.deliveredAt = block.timestamp;
        emit DeliverySubmitted(awardId, deliveryHash);
    }

    function acceptAward(uint256 awardId) external {
        Award storage award = awards[awardId];
        require(award.status == AwardStatus.Delivered, "not delivered");
        _releaseAward(awardId, msg.sender);
    }

    function claimPayout(uint256 awardId) external {
        Award storage award = awards[awardId];
        require(award.status == AwardStatus.Delivered, "not delivered");

        uint256 bountyId = _findBountyForAward(awardId);
        Bounty storage bounty = bounties[bountyId];
        require(block.timestamp >= bounty.acceptDeadline, "accept window open");
        _releaseAward(awardId, msg.sender);
    }

    function refundUnawarded(uint256 bountyId) external {
        Bounty storage bounty = bounties[bountyId];
        require(
            bounty.status == BountyStatus.Funded || bounty.status == BountyStatus.Open,
            "not refundable"
        );
        require(block.timestamp > bounty.biddingDeadline, "bidding open");
        require(bounty.remainingBudget > 0, "nothing to refund");

        uint256 amount = bounty.remainingBudget;
        bounty.remainingBudget = 0;
        bounty.status = BountyStatus.Refunded;
        require(token.transfer(bounty.poster, amount), "refund failed");
        emit BountyRefunded(bountyId, bounty.poster, amount);
    }

    function _releaseAward(uint256 awardId, address actor) private {
        Award storage award = awards[awardId];
        uint256 amount = award.amount;
        award.status = AwardStatus.Paid;
        require(token.transfer(award.provider, amount), "payout failed");
        emit AwardAccepted(awardId, actor, amount);
        emit AwardClaimed(awardId, actor, amount);
    }

    function _findBountyForAward(uint256 awardId) private view returns (uint256) {
        for (uint256 bountyId = 1; bountyId <= nextBountyId; bountyId++) {
            uint256[] storage ids = bountyAwardIds[bountyId];
            for (uint256 index = 0; index < ids.length; index++) {
                if (ids[index] == awardId) {
                    return bountyId;
                }
            }
        }
        revert("award not found");
    }
}