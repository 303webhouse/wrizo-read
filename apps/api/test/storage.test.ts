import { afterEach, describe, expect, it } from "vitest";
import { MemoryStorage, S3Storage, createStorage } from "../src/storage";

const S3_COMPLETE = {
  endpoint: "https://s3.example.com",
  bucket: "wrizo",
  accessKeyId: "AK",
  secretAccessKey: "SK",
};
const S3_INCOMPLETE = { endpoint: "", bucket: "", accessKeyId: "", secretAccessKey: "" };

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("createStorage fails closed on incomplete S3 (Fable finding A)", () => {
  const savedNodeEnv = process.env.NODE_ENV;
  const savedFlag = process.env.ALLOW_MEMORY_STORAGE;

  afterEach(() => {
    setEnv("NODE_ENV", savedNodeEnv);
    setEnv("ALLOW_MEMORY_STORAGE", savedFlag);
  });

  it("returns S3Storage when the S3 config is complete", () => {
    expect(createStorage(S3_COMPLETE)).toBeInstanceOf(S3Storage);
  });

  it("throws in production even with the opt-in flag set", () => {
    setEnv("NODE_ENV", "production");
    setEnv("ALLOW_MEMORY_STORAGE", "true");
    expect(() => createStorage(S3_INCOMPLETE)).toThrow(/object storage is not configured/);
  });

  it("throws outside production without the explicit opt-in", () => {
    setEnv("NODE_ENV", "test");
    setEnv("ALLOW_MEMORY_STORAGE", undefined);
    expect(() => createStorage(S3_INCOMPLETE)).toThrow();
  });

  it("allows in-memory only with the explicit opt-in outside production", () => {
    setEnv("NODE_ENV", "development");
    setEnv("ALLOW_MEMORY_STORAGE", "true");
    expect(createStorage(S3_INCOMPLETE)).toBeInstanceOf(MemoryStorage);
  });
});
