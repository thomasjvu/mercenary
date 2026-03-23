// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract RaidRegistry {
    struct Raid {
        address client;
        uint256 createdAt;
        bytes32 taskHash;
        uint256[] childJobIds;
        bytes32 evaluationHash;
        bool finalized;
    }

    uint256 public nextRaidId;
    mapping(uint256 => Raid) public raids;

    event RaidCreated(uint256 indexed raidId, address indexed client, bytes32 taskHash);
    event RaidChildLinked(uint256 indexed raidId, uint256 indexed jobId);
    event RaidFinalized(uint256 indexed raidId, bytes32 evaluationHash);

    function createRaid(bytes32 taskHash) external returns (uint256 raidId) {
        raidId = ++nextRaidId;
        raids[raidId].client = msg.sender;
        raids[raidId].createdAt = block.timestamp;
        raids[raidId].taskHash = taskHash;
        emit RaidCreated(raidId, msg.sender, taskHash);
    }

    function linkChildJob(uint256 raidId, uint256 jobId) external {
        Raid storage raid = _requireRaid(raidId);
        require(msg.sender == raid.client, "only client");
        raid.childJobIds.push(jobId);
        emit RaidChildLinked(raidId, jobId);
    }

    function finalizeRaid(uint256 raidId, bytes32 evaluationHash) external {
        Raid storage raid = _requireRaid(raidId);
        require(msg.sender == raid.client, "only client");
        require(!raid.finalized, "already finalized");

        raid.evaluationHash = evaluationHash;
        raid.finalized = true;

        emit RaidFinalized(raidId, evaluationHash);
    }

    function _requireRaid(uint256 raidId) internal view returns (Raid storage raid) {
        raid = raids[raidId];
        require(raid.client != address(0), "raid not found");
    }
}
