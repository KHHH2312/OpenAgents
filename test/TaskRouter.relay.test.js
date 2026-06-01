const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TaskRouter Gas Sponsorship", function () {
  let TaskRouter, taskRouter, AgentRegistry, agentRegistry;
  let owner, agentOwner, relayer;
  let agentId;

  beforeEach(async function () {
    [owner, agentOwner, relayer, user] = await ethers.getSigners();

    AgentRegistry = await ethers.getContractFactory("AgentRegistry");
    agentRegistry = await AgentRegistry.deploy(ethers.parseEther("0.1"));
    await agentRegistry.waitForDeployment();

    TaskRouter = await ethers.getContractFactory("TaskRouter");
    taskRouter = await TaskRouter.deploy(await agentRegistry.getAddress(), 100);
    await taskRouter.waitForDeployment();

    // Register agent
    await agentRegistry.connect(agentOwner).registerAgent("TestAgent", "http://endpoint", { value: ethers.parseEther("0.1") });
    agentId = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "string", "uint256"],
        [agentOwner.address, "TestAgent", (await ethers.provider.getBlock("latest")).timestamp]
      )
    );
  });

  it("should allow agent to submit task result without holding ETH", async function () {
    // Deposit stake for agent
    await taskRouter.connect(agentOwner).depositStake({ value: ethers.parseEther("1") });

    // Create a task
    await taskRouter.connect(user).createTask("Test Task", Math.floor(Date.now() / 1000) + 3600, { value: ethers.parseEther("1") });
    const taskId = 0;

    // Assign task
    await taskRouter.connect(agentOwner).assignTask(taskId, agentId);

    // Prepare completeTask call
    const data = taskRouter.interface.encodeFunctionData("completeTask", [taskId, "0x1234"]);

    // Sign the transaction data
    const nonce = await taskRouter.nonces(agentOwner.address);
    const hash = ethers.solidityPackedKeccak256(
      ["address", "bytes", "uint256", "address"],
      [agentOwner.address, data, nonce, await taskRouter.getAddress()]
    );
    const signature = await agentOwner.signMessage(ethers.getBytes(hash));

    // Execute via relayer
    const tx = await taskRouter.connect(relayer).executeOnBehalf(agentOwner.address, data, signature);
    await tx.wait();

    // Verify task completion
    const task = await taskRouter.tasks(taskId);
    expect(task.status).to.equal(2); // Completed
  });

  it("should fail replay prevention (nonce reused)", async function () {
    await taskRouter.connect(agentOwner).depositStake({ value: ethers.parseEther("1") });
    await taskRouter.connect(user).createTask("Test Task", Math.floor(Date.now() / 1000) + 3600, { value: ethers.parseEther("1") });
    const taskId = 0;

    await taskRouter.connect(agentOwner).assignTask(taskId, agentId);

    const data = taskRouter.interface.encodeFunctionData("completeTask", [taskId, "0x1234"]);
    const nonce = await taskRouter.nonces(agentOwner.address);
    const hash = ethers.solidityPackedKeccak256(
      ["address", "bytes", "uint256", "address"],
      [agentOwner.address, data, nonce, await taskRouter.getAddress()]
    );
    const signature = await agentOwner.signMessage(ethers.getBytes(hash));

    await taskRouter.connect(relayer).executeOnBehalf(agentOwner.address, data, signature);

    // Replay should fail
    await expect(
      taskRouter.connect(relayer).executeOnBehalf(agentOwner.address, data, signature)
    ).to.be.revertedWith("Invalid signature");
  });

  it("should fail if agent has insufficient stake", async function () {
    // No stake deposited
    await taskRouter.connect(user).createTask("Test Task", Math.floor(Date.now() / 1000) + 3600, { value: ethers.parseEther("1") });
    const taskId = 0;

    // Direct assign (not relayed) just to test completion relay
    await taskRouter.connect(agentOwner).assignTask(taskId, agentId);

    const data = taskRouter.interface.encodeFunctionData("completeTask", [taskId, "0x1234"]);
    const nonce = await taskRouter.nonces(agentOwner.address);
    const hash = ethers.solidityPackedKeccak256(
      ["address", "bytes", "uint256", "address"],
      [agentOwner.address, data, nonce, await taskRouter.getAddress()]
    );
    const signature = await agentOwner.signMessage(ethers.getBytes(hash));

    await expect(
      taskRouter.connect(relayer).executeOnBehalf(agentOwner.address, data, signature)
    ).to.be.revertedWith("Insufficient stake");
  });
});
