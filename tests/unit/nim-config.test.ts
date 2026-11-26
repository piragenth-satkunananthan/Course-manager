import { describe, expect, it } from "vitest";
import { maskKey, pickNim } from "@/server/ai/nim-config";

const ENV = { NIM_API_KEY: "nvapi-server-key-1234", NIM_MODEL: "nvidia/server-model", NIM_BASE_URL: "https://nim.example/v1" };

describe("which NIM key and model are used (#81, U45)", () => {
  it("uses the server's key and model when the Student saved none", () => {
    expect(pickNim({ apiKey: null, model: null }, ENV)).toEqual({ apiKey: "nvapi-server-key-1234", model: "nvidia/server-model", base: "https://nim.example/v1", keySource: "server" });
  });

  it("uses the Student's saved key and model over the server's", () => {
    expect(pickNim({ apiKey: "nvapi-mine-abcd", model: "nvidia/other" }, ENV)).toMatchObject({ apiKey: "nvapi-mine-abcd", model: "nvidia/other", keySource: "saved" });
  });

  it("falls back to NVIDIA's address when none is set", () => {
    expect(pickNim({ apiKey: null, model: null }, {}).base).toBe("https://integrate.api.nvidia.com/v1");
  });

  it("shows only the last 4 characters of a key", () => {
    expect(maskKey("nvapi-mine-abcd")).toBe("••••abcd");
    expect(maskKey("")).toBeNull();
  });
});
