// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RaidRegistry} from "../src/RaidRegistry.sol";

contract RaidRegistryTest is Test {
    RaidRegistry registry;
    address client = address(0xC11E17);

    function setUp() public {
        registry = new RaidRegistry();
    }

    function test_linkChildJob_blocked_after_finalize() public {
        vm.prank(client);
        uint256 raidId = registry.createRaid(bytes32(uint256(1)));
        vm.prank(client);
        registry.linkChildJob(raidId, 10);
        vm.prank(client);
        registry.finalizeRaid(raidId, bytes32(uint256(99)));

        vm.prank(client);
        vm.expectRevert(bytes("finalized"));
        registry.linkChildJob(raidId, 11);
    }

    function test_finalize_idempotent_guard() public {
        vm.prank(client);
        uint256 raidId = registry.createRaid(bytes32(uint256(1)));
        vm.prank(client);
        registry.finalizeRaid(raidId, bytes32(uint256(2)));
        vm.prank(client);
        vm.expectRevert(bytes("already finalized"));
        registry.finalizeRaid(raidId, bytes32(uint256(3)));
    }
}
