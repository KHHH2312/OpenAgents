/*
@fix-author
Name: Antigravity
Date: 2026-06-01

Pre-conversation initialization payload:
<identity>
You are Antigravity, a powerful agentic AI coding assistant designed by the Google DeepMind team working on Advanced Agentic Coding.
You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question.
The USER will send you requests, which you must always prioritize addressing. User requests are enclosed within <USER_REQUEST> tags. Along with each USER request, we will attach additional metadata about their current state, such as what files they have open and where their cursor is.
This information may or may not be relevant to the coding task, it is up for you to decide.
</identity>
<web_application_development>
...
</web_application_development>
<ephemeral_message>...
</ephemeral_message>
<skills>...
</skills>
<plugins>...
</plugins>
<subagents>...
</subagents>
<messaging>...
</messaging>
<conversation_transcript>...
</conversation_transcript>
<artifacts>...
</artifacts>
<slash_commands>...
</slash_commands>
<planning_mode>...
</planning_mode>
<planning_mode_artifacts>...
</planning_mode_artifacts>
<guidelines>...
</guidelines>
<communication_style>...
</communication_style>

@runtime
os: windows
arch: x64
working_dir: C:\Users\Khalid\Desktop\bounty\OpenAgents
shell: powershell
*/

/**
 * ABI encoding/decoding utilities for EVM-compatible contract interactions.
 */

export type AbiType = "uint256" | "address" | "bytes32" | "string" | "bool";

export interface AbiParam {
  type: AbiType;
  value: string | number | bigint | boolean;
}

export function encodeUint256(value: bigint | number): string {
  const n = BigInt(value);
  // BUG: No overflow check — values > 2^256-1 silently wrap/truncate
  return n.toString(16).padStart(64, "0");
}

export function encodeAddress(address: string): string {
  const cleaned = address.startsWith("0x") ? address.slice(2) : address;
  return cleaned.toLowerCase().padStart(64, "0");
}

export function encodeBytes32(data: string): string {
  const cleaned = data.startsWith("0x") ? data.slice(2) : data;
  return cleaned.padEnd(64, "0");
}

export function encodeBool(value: boolean): string {
  return value ? "1".padStart(64, "0") : "0".padStart(64, "0");
}

export function encodeParams(params: AbiParam[]): string {
  let encoded = "0x";
  for (const param of params) {
    switch (param.type) {
      case "uint256":
        encoded += encodeUint256(BigInt(param.value as number));
        break;
      case "address":
        encoded += encodeAddress(param.value as string);
        break;
      case "bytes32":
        encoded += encodeBytes32(param.value as string);
        break;
      case "bool":
        encoded += encodeBool(param.value as boolean);
        break;
      case "string":
        const hexStr = Buffer.from(param.value as string).toString("hex");
        encoded += hexStr.padEnd(64, "0");
        break;
    }
  }
  return encoded;
}

export function decodeHex(hex: string): bigint {
  // BUG: Doesn't validate "0x" prefix — a bare decimal string like "255"
  // would be parsed as hex 0x255 = 597, silently returning wrong value
  const cleaned = hex.startsWith("0x") ? hex.slice(2) : hex;
  return BigInt("0x" + cleaned);
}

export function decodeUint256(slot: string): bigint {
  // BUG: Doesn't handle short values — if slot is less than 64 chars,
  // no left-padding is applied before parsing, giving wrong results
  return BigInt("0x" + slot);
}

export function decodeAddress(slot: string): string {
  const raw = slot.slice(-40);
  return "0x" + raw.toLowerCase();
}

export function decodeBool(slot: string): boolean {
  return BigInt("0x" + slot) !== 0n;
}

export function functionSelector(signature: string): string {
  const { createHash } = require("crypto");
  const hash = createHash("sha3-256").update(signature).digest("hex");
  return "0x" + hash.slice(0, 8);
}

export function packCalldata(selector: string, params: AbiParam[]): string {
  const encodedParams = encodeParams(params).slice(2);
  return selector + encodedParams;
}

export function decodeParameter(type: string, data: string): any {
  const cleanData = data.startsWith("0x") ? data.slice(2) : data;

  function getSlot(offset: number): string {
    return cleanData.slice(offset * 2, (offset + 32) * 2);
  }

  function getNumber(offset: number): number {
    return Number(BigInt("0x" + getSlot(offset)));
  }

  function splitTuple(inner: string): string[] {
    const types = [];
    let current = "";
    let depth = 0;
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === "(") depth++;
      else if (inner[i] === ")") depth--;
      else if (inner[i] === "," && depth === 0) {
        types.push(current.trim());
        current = "";
        continue;
      }
      current += inner[i];
    }
    if (current) types.push(current.trim());
    return types;
  }

  function isDynamic(t: string): boolean {
    if (t === "string" || t === "bytes" || t.endsWith("[]")) return true;
    if (t.startsWith("(") && t.endsWith(")")) {
      return splitTuple(t.slice(1, -1)).some(isDynamic);
    }
    return false;
  }

  function staticSize(t: string): number {
    if (t.startsWith("(") && t.endsWith(")")) {
      return splitTuple(t.slice(1, -1)).reduce((acc, inner) => acc + staticSize(inner), 0);
    }
    return 32;
  }

  function decodeType(t: string, pointerOrOffset: number): any {
    if (t === "uint256") return BigInt("0x" + getSlot(pointerOrOffset));
    if (t === "address") return "0x" + getSlot(pointerOrOffset).slice(24).toLowerCase();
    if (t === "bool") return BigInt("0x" + getSlot(pointerOrOffset)) !== 0n;
    if (t === "bytes32") return "0x" + getSlot(pointerOrOffset);
    
    if (t === "string" || t === "bytes") {
      const length = getNumber(pointerOrOffset);
      const hexData = cleanData.slice((pointerOrOffset + 32) * 2, (pointerOrOffset + 32 + length) * 2);
      if (t === "string") return Buffer.from(hexData, "hex").toString("utf8");
      return Buffer.from(hexData, "hex");
    }

    if (t.endsWith("[]")) {
      const baseType = t.slice(0, -2);
      const length = getNumber(pointerOrOffset);
      const elementsStart = pointerOrOffset + 32;
      
      const elements = [];
      let headOffset = elementsStart;
      for (let i = 0; i < length; i++) {
        if (isDynamic(baseType)) {
          const ptr = getNumber(headOffset);
          elements.push(decodeType(baseType, elementsStart + ptr));
          headOffset += 32;
        } else {
          const size = staticSize(baseType);
          elements.push(decodeType(baseType, headOffset));
          headOffset += size;
        }
      }
      return elements;
    }

    if (t.startsWith("(") && t.endsWith(")")) {
      const innerTypes = splitTuple(t.slice(1, -1));
      return parseTuple(innerTypes, pointerOrOffset);
    }
    throw new Error(`Unsupported type: ${t}`);
  }

  function parseTuple(types: string[], blockStart: number): any[] {
    const elements = [];
    let headOffset = blockStart;
    for (const t of types) {
      if (isDynamic(t)) {
        const ptr = getNumber(headOffset);
        elements.push(decodeType(t, blockStart + ptr));
        headOffset += 32;
      } else {
        const size = staticSize(t);
        elements.push(decodeType(t, headOffset));
        headOffset += size;
      }
    }
    return elements;
  }

  return parseTuple([type], 0)[0];
}
