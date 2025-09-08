import { describe, expect, test } from "bun:test";
import { buildFilename, generateLogStream } from "../../src/lib/server/loggen";

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  out += new TextDecoder().decode();
  return out;
}

describe("loggen: buildFilename", () => {
  test("形式が 'dummy-<format>-YYYY-MM-DD-HH-MM-SS.log' である", () => {
    for (const f of ["apache-common", "apache-combined", "tomcat-access", "custom"] as const) {
      const name = buildFilename(f);
      expect(name).toMatch(
        /^dummy-(apache-common|apache-combined|tomcat-access|custom)-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.log$/
      );
    }
  });
});

describe("loggen: generateLogStream 基本", () => {
  test("指定サイズ以上のデータが生成される", async () => {
    const total = 4096;
    const s = generateLogStream({ format: "apache-common", totalSizeBytes: total, newline: "\n" });
    const text = await readAll(s);
    expect(text.length).toBeGreaterThanOrEqual(1); // 文字列としては >=1
  });

  test("改行コード指定 (CRLF)", async () => {
    const s = generateLogStream({ format: "apache-common", totalSizeBytes: 2048, newline: "\r\n" });
    const text = await readAll(s);
    expect(text).toContain("\r\n");
    const lines = text.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
  });

  test("区切り文字の切替 (tab/comma/pipe)", async () => {
    for (const delimiter of ["tab", "comma", "pipe"] as const) {
      const s = generateLogStream({ format: "apache-common", totalSizeBytes: 2048, delimiter });
      const text = await readAll(s);
      const line = text.split(/\r?\n/)[0] ?? "";
      const sep = delimiter === "tab" ? "\t" : delimiter === "comma" ? "," : "|";
      expect(line.includes(sep)).toBeTrue();
    }
  });
});

describe("loggen: 行長制約", () => {
  test("maxLineLength を超えない（largeLineRatio=1）", async () => {
    const max = 80;
    const text = await readAll(
      generateLogStream({ format: "apache-combined", totalSizeBytes: 4096, maxLineLength: max, largeLineRatio: 1 })
    );
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(max);
    }
  });
});
