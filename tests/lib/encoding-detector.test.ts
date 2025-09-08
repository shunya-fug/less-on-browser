import { describe, expect, test } from "bun:test";
import { detectBOM, detectFileEncoding, detectStatistical } from "../../src/lib/encoding-detector";

// ヘルパー: number[]/Uint8Array から ArrayBuffer を作成（常に ArrayBuffer を生成）
function ab(bytes: number[] | Uint8Array): ArrayBuffer {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const out = new ArrayBuffer(u8.byteLength);
  new Uint8Array(out).set(u8);
  return out;
}

describe("encoding-detector: BOM 検出", () => {
  test("UTF-8 BOM を検出する", () => {
    const buf = ab([0xef, 0xbb, 0xbf, 0x41, 0x42]);
    const r = detectBOM(buf)!;
    expect(r.encoding).toBe("utf-8");
    expect(r.method).toBe("BOM");
    expect(r.confidence).toBe(1);
  });

  test("UTF-16LE BOM を検出する", () => {
    const buf = ab([0xff, 0xfe, 0x41, 0x00]);
    const r = detectBOM(buf)!;
    expect(r.encoding).toBe("utf-16le");
    expect(r.method).toBe("BOM");
    expect(r.confidence).toBe(1);
  });

  test("UTF-16BE BOM を検出する", () => {
    const buf = ab([0xfe, 0xff, 0x00, 0x41]);
    const r = detectBOM(buf)!;
    expect(r.encoding).toBe("utf-16be");
    expect(r.method).toBe("BOM");
    expect(r.confidence).toBe(1);
  });
});

describe("encoding-detector: 統計的判定", () => {
  test("非印字 ASCII が多いと ascii と判定する", () => {
    // 0x00 を多数含む -> asciiRatio が高く、validUtf8Ratio は低い
    const data = new Uint8Array(4096).fill(0x00);
    const r = detectStatistical(ab(data));
    expect(r.encoding).toBe("ascii");
    expect(r.method).toBe("statistical");
  });

  test("印字可能 ASCII 主体は UTF-8 (statistical)", () => {
    const s = "A".repeat(2000) + "\n" + "B".repeat(2000);
    const data = new TextEncoder().encode(s);
    const r = detectStatistical(ab(data));
    expect(r.encoding).toBe("utf-8");
    expect(r.method).toBe("statistical");
    expect(r.confidence).toBeGreaterThan(0.95);
  });

  test("Shift_JIS らしい 2 バイトパターンを検出する", () => {
    // (0x81..0x9F,0xE0..0xFC) x (0x40..0x7E,0x80..0xFC)
    const pairs: number[] = [];
    for (let i = 0; i < 120; i++) pairs.push(0x81, 0x40);
    const r = detectStatistical(ab(pairs));
    expect(r.encoding).toBe("shift_jis");
    expect(r.method).toBe("statistical");
  });

  test("EUC-JP らしい 2 バイトパターンを検出する", () => {
    const pairs: number[] = [];
    for (let i = 0; i < 120; i++) pairs.push(0xa1, 0xa1);
    const r = detectStatistical(ab(pairs));
    expect(r.encoding).toBe("euc-jp");
    expect(r.method).toBe("statistical");
  });
});

describe("encoding-detector: detectFileEncoding", () => {
  test("空バッファはデフォルトの UTF-8 (method=default)", () => {
    const r = detectFileEncoding(ab([]));
    expect(r.encoding).toBe("utf-8");
    expect(r.method).toBe("default");
    expect(r.confidence).toBe(0.5);
  });

  test("BOM を統計判定より優先する", () => {
    const body = new Uint8Array(100).fill(0x00);
    const input = ab(new Uint8Array([0xef, 0xbb, 0xbf, ...body]));
    const r = detectFileEncoding(input);
    expect(r.method).toBe("BOM");
    expect(r.encoding).toBe("utf-8");
  });

  test("先頭 8KB のサンプリングに限定される", () => {
    // 先頭 8KB は 0x00 群（ASCII 判定寄り）、後半に SJIS 風パターンを置いても先頭の特徴が優先される
    const first = new Uint8Array(8192).fill(0x00);
    const later = new Uint8Array(4000);
    for (let i = 0; i < later.length; i += 2) {
      later[i] = 0x81;
      if (i + 1 < later.length) later[i + 1] = 0x40;
    }
    const joined = new Uint8Array(first.length + later.length);
    joined.set(first, 0);
    joined.set(later, first.length);
    const r = detectFileEncoding(ab(joined));
    // 実装のしきい値調整に耐えるため、ascii/utf-8 のいずれかを許容
    expect(["ascii", "utf-8"]).toContain(r.encoding);
  });
});
