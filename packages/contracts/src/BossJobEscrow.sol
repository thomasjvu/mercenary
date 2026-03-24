// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
}

contract BossJobEscrow {
    enum Status {
        Open,
        Funded,
        Submitted,
        Completed,
        Rejected,
        Expired
    }

    struct Job {
        address client;
        address provider;
        address evaluator;
        uint256 budget;
        uint256 expiresAt;
        bytes32 deliverableHash;
        Status status;
        string description;
    }

    IERC20Minimal public immutable token;
    uint256 public nextJobId;
    mapping(uint256 => Job) public jobs;

    event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator);
    event ProviderSet(uint256 indexed jobId, address provider);
    event BudgetSet(uint256 indexed jobId, uint256 amount);
    event JobFunded(uint256 indexed jobId, uint256 amount);
    event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverableHash);
    event JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason);
    event JobRejected(uint256 indexed jobId, address indexed rejector, bytes32 reason);
    event PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount);
    event Refunded(uint256 indexed jobId, address indexed client, uint256 amount);

    constructor(address token_) {
        token = IERC20Minimal(token_);
    }

    function createJob(
        address provider,
        address evaluator,
        uint256 expiresAt,
        string calldata description
    ) external returns (uint256 jobId) {
        require(evaluator != address(0), "evaluator required");
        require(expiresAt > block.timestamp, "expiry in future");

        jobId = ++nextJobId;
        jobs[jobId] = Job({
            client: msg.sender,
            provider: provider,
            evaluator: evaluator,
            budget: 0,
            expiresAt: expiresAt,
            deliverableHash: bytes32(0),
            status: Status.Open,
            description: description
        });

        emit JobCreated(jobId, msg.sender, provider, evaluator);
    }

    function setProvider(uint256 jobId, address provider) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.client, "only client");
        require(job.status == Status.Open, "not open");
        require(job.provider == address(0), "provider set");
        require(provider != address(0), "bad provider");

        job.provider = provider;
        emit ProviderSet(jobId, provider);
    }

    function setBudget(uint256 jobId, uint256 amount) external {
        Job storage job = jobs[jobId];
        require(job.status == Status.Open, "not open");
        require(msg.sender == job.client || msg.sender == job.provider, "not allowed");

        job.budget = amount;
        emit BudgetSet(jobId, amount);
    }

    function fund(uint256 jobId, uint256 expectedBudget) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.client, "only client");
        require(job.status == Status.Open, "not open");
        require(job.budget > 0, "budget missing");
        require(job.provider != address(0), "provider missing");
        require(job.budget == expectedBudget, "budget changed");
        require(token.transferFrom(msg.sender, address(this), job.budget), "transfer failed");

        job.status = Status.Funded;
        emit JobFunded(jobId, job.budget);
    }

    function submit(uint256 jobId, bytes32 deliverableHash) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.provider, "only provider");
        require(job.status == Status.Funded, "not funded");

        job.deliverableHash = deliverableHash;
        job.status = Status.Submitted;
        emit JobSubmitted(jobId, msg.sender, deliverableHash);
    }

    function complete(uint256 jobId, bytes32 reason) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.evaluator, "only evaluator");
        require(job.status == Status.Submitted, "not submitted");

        job.status = Status.Completed;
        require(token.transfer(job.provider, job.budget), "payout failed");
        emit JobCompleted(jobId, msg.sender, reason);
        emit PaymentReleased(jobId, job.provider, job.budget);
    }

    function reject(uint256 jobId, bytes32 reason) external {
        Job storage job = jobs[jobId];
        if (job.status == Status.Open) {
            require(msg.sender == job.client, "only client");
            job.status = Status.Rejected;
            emit JobRejected(jobId, msg.sender, reason);
            return;
        }

        require(msg.sender == job.evaluator, "only evaluator");
        require(job.status == Status.Funded || job.status == Status.Submitted, "bad status");

        job.status = Status.Rejected;
        require(token.transfer(job.client, job.budget), "refund failed");
        emit JobRejected(jobId, msg.sender, reason);
        emit Refunded(jobId, job.client, job.budget);
    }

    function claimRefund(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(block.timestamp >= job.expiresAt, "not expired");
        require(job.status == Status.Funded || job.status == Status.Submitted, "bad status");

        job.status = Status.Expired;
        if (job.budget > 0) {
            require(token.transfer(job.client, job.budget), "refund failed");
            emit Refunded(jobId, job.client, job.budget);
        }
    }
}
