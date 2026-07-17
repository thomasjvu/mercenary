// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RaidRegistry} from "../src/RaidRegistry.sol";
import {BossJobEscrow} from "../src/BossJobEscrow.sol";
import {MockERC20} from "./MockERC20.sol";

contract RaidRegistryTest is Test {
    MockERC20 token;
    BossJobEscrow escrow;
    RaidRegistry registry;
    address client = address(0xC11E17);
    address other = address(0x0DD);
    address provider = address(0xB201DE2);
    address evaluator = address(0xE4A10A70);

    function setUp() public {
        token = new MockERC20();
        escrow = new BossJobEscrow(address(token));
        registry = new RaidRegistry(address(escrow));
    }

    function test_linkChildJob_requires_own_job_on_escrow() public {
        vm.prank(client);
        uint256 jobId = escrow.createJob(provider, evaluator, block.timestamp + 1 days, "task");
        vm.prank(client);
        uint256 raidId = registry.createRaid(bytes32(uint256(1)));
        vm.prank(client);
        registry.linkChildJob(raidId, jobId);

        vm.prank(client);
        vm.expectRevert(bytes("job not found"));
        registry.linkChildJob(raidId, 999);
    }

    function test_linkChildJob_rejects_foreign_job() public {
        vm.prank(other);
        uint256 foreignJob = escrow.createJob(provider, evaluator, block.timestamp + 1 days, "x");
        vm.prank(client);
        uint256 raidId = registry.createRaid(bytes32(uint256(1)));
        vm.prank(client);
        vm.expectRevert(bytes("not job client"));
        registry.linkChildJob(raidId, foreignJob);
    }

    function test_linkChildJob_blocked_after_finalize() public {
        vm.prank(client);
        uint256 jobId = escrow.createJob(provider, evaluator, block.timestamp + 1 days, "task");
        vm.prank(client);
        uint256 raidId = registry.createRaid(bytes32(uint256(1)));
        vm.prank(client);
        registry.linkChildJob(raidId, jobId);
        vm.prank(client);
        registry.finalizeRaid(raidId, bytes32(uint256(99)));

        vm.prank(client);
        uint256 job2 = escrow.createJob(provider, evaluator, block.timestamp + 2 days, "task2");
        vm.prank(client);
        vm.expectRevert(bytes("finalized"));
        registry.linkChildJob(raidId, job2);
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

    function test_constructor_rejects_zero_escrow() public {
        vm.expectRevert(bytes("escrow required"));
        new RaidRegistry(address(0));
    }
}
