import { decodeParameter } from "../src/utils/encoding";
import * as assert from "assert";
import { AbiCoder } from "ethers";

async function testDecode() {
  const type = "(string[],uint256,bytes)";
  const value = [["hello", "world"], 42n, Buffer.from("data")];
  
  const encoded = AbiCoder.defaultAbiCoder().encode([type], [value]);
  const decoded = decodeParameter(type, encoded);
  
  assert.deepStrictEqual(decoded, value);
  console.log("All decoding tests passed!");
}

testDecode().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
