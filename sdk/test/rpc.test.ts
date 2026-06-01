import { RpcProvider } from "../src/providers/rpc";
import * as assert from "assert";

// Mock fetch
(global as any).fetch = async (url: string, options: any) => {
  const body = JSON.parse(options.body);
  const isBatch = Array.isArray(body);
  
  if (isBatch) {
    const responses = body.map((req: any) => {
      if (req.method === "fail") {
        return {
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32000, message: "Simulated failure" }
        };
      }
      if (req.method === "timeout") {
        return null;
      }
      return {
        jsonrpc: "2.0",
        id: req.id,
        result: req.params[0] || "success"
      };
    }).filter((x: any) => x !== null);
    
    // Shuffle responses
    responses.sort(() => Math.random() - 0.5);

    return {
      json: async () => responses
    } as any;
  }
  return {} as any;
};

async function testBatchCall() {
  const provider = new RpcProvider({ url: "http://localhost", chainId: 1 });
  
  const calls = [
    { method: "success_1", params: ["res_1"] },
    { method: "fail", params: [] },
    { method: "timeout", params: [] },
    { method: "success_2", params: ["res_2"] },
  ];

  const results = await provider.batchCall(calls);

  assert.strictEqual(results.length, 4);
  assert.strictEqual(results[0], "res_1");
  assert.ok(results[1] instanceof Error);
  assert.strictEqual((results[1] as Error).message, "RPC error -32000: Simulated failure");
  assert.ok(results[2] instanceof Error);
  assert.strictEqual((results[2] as Error).message, "Request timed out");
  assert.strictEqual(results[3], "res_2");

  console.log("All tests passed: shuffled response order and partial failure handled correctly!");
}

testBatchCall().catch((e) => {
  console.error("Test failed", e);
  process.exit(1);
});
