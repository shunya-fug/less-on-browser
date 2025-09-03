import { DetectionResultSchema, EncodingValueSchema, type DetectionResult } from './schemas/encodings.js';

/**
 * ファイルのBOM (Byte Order Mark) を検出してエンコーディングを判定
 */
export function detectBOM(buffer: ArrayBuffer): DetectionResult | null {
  const bytes = new Uint8Array(buffer.slice(0, 4));
  
  // UTF-8 BOM: EF BB BF
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return DetectionResultSchema.parse({
      encoding: 'utf-8',
      confidence: 1.0,
      method: 'BOM'
    });
  }
  
  // UTF-16 Little Endian BOM: FF FE
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return DetectionResultSchema.parse({
      encoding: 'utf-16le',
      confidence: 1.0,
      method: 'BOM'
    });
  }
  
  // UTF-16 Big Endian BOM: FE FF
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return DetectionResultSchema.parse({
      encoding: 'utf-16be',
      confidence: 1.0,
      method: 'BOM'
    });
  }
  
  return null;
}

/**
 * 統計的解析によるエンコーディング検出
 */
export function detectStatistical(buffer: ArrayBuffer): DetectionResult {
  const bytes = new Uint8Array(buffer.slice(0, Math.min(8192, buffer.byteLength))); // 最初の8KBをサンプリング
  
  // ASCII文字の割合を計算
  let asciiCount = 0;
  let validUtf8Sequences = 0;
  let totalBytes = 0;
  
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    totalBytes++;
    
    // ASCII範囲 (0x00-0x7F)
    if (byte <= 0x7F) {
      asciiCount++;
      if (byte >= 0x20 && byte <= 0x7E) {
        // 印刷可能ASCII文字
        validUtf8Sequences++;
      } else if (byte === 0x09 || byte === 0x0A || byte === 0x0D) {
        // タブ、改行、復帰文字
        validUtf8Sequences++;
      }
    } else {
      // UTF-8のマルチバイト文字をチェック
      let sequenceLength = 0;
      if ((byte & 0xE0) === 0xC0) {
        sequenceLength = 2; // 110xxxxx
      } else if ((byte & 0xF0) === 0xE0) {
        sequenceLength = 3; // 1110xxxx
      } else if ((byte & 0xF8) === 0xF0) {
        sequenceLength = 4; // 11110xxx
      }
      
      if (sequenceLength > 0 && i + sequenceLength - 1 < bytes.length) {
        let validSequence = true;
        for (let j = 1; j < sequenceLength; j++) {
          if ((bytes[i + j] & 0xC0) !== 0x80) { // 10xxxxxx
            validSequence = false;
            break;
          }
        }
        if (validSequence) {
          validUtf8Sequences++;
          i += sequenceLength - 1; // シーケンスをスキップ
        }
      }
    }
  }
  
  const asciiRatio = asciiCount / totalBytes;
  const validUtf8Ratio = validUtf8Sequences / totalBytes;
  
  // UTF-8判定
  if (validUtf8Ratio > 0.95) {
    return DetectionResultSchema.parse({
      encoding: 'utf-8',
      confidence: validUtf8Ratio,
      method: 'statistical'
    });
  }
  
  // ASCII判定
  if (asciiRatio > 0.99) {
    return DetectionResultSchema.parse({
      encoding: 'ascii',
      confidence: asciiRatio,
      method: 'statistical'
    });
  }
  
  // 日本語文字コードの簡易判定
  if (hasShiftJISPatterns(bytes)) {
    return DetectionResultSchema.parse({
      encoding: 'shift_jis',
      confidence: 0.7,
      method: 'statistical'
    });
  }
  
  if (hasEucJpPatterns(bytes)) {
    return DetectionResultSchema.parse({
      encoding: 'euc-jp',
      confidence: 0.7,
      method: 'statistical'
    });
  }
  
  // デフォルトはUTF-8
  return DetectionResultSchema.parse({
    encoding: 'utf-8',
    confidence: 0.5,
    method: 'default'
  });
}

/**
 * Shift_JIS文字パターンの検出
 */
function hasShiftJISPatterns(bytes: Uint8Array): boolean {
  let sjisLikeBytes = 0;
  const totalBytes = bytes.length;
  
  for (let i = 0; i < bytes.length - 1; i++) {
    const byte1 = bytes[i];
    const byte2 = bytes[i + 1];
    
    // Shift_JISの2バイト文字範囲
    if (
      ((byte1 >= 0x81 && byte1 <= 0x9F) || (byte1 >= 0xE0 && byte1 <= 0xFC)) &&
      ((byte2 >= 0x40 && byte2 <= 0x7E) || (byte2 >= 0x80 && byte2 <= 0xFC))
    ) {
      sjisLikeBytes += 2;
      i++; // 2バイト文字なので次の文字をスキップ
    }
  }
  
  return sjisLikeBytes / totalBytes > 0.1;
}

/**
 * EUC-JP文字パターンの検出
 */
function hasEucJpPatterns(bytes: Uint8Array): boolean {
  let eucLikeBytes = 0;
  const totalBytes = bytes.length;
  
  for (let i = 0; i < bytes.length - 1; i++) {
    const byte1 = bytes[i];
    const byte2 = bytes[i + 1];
    
    // EUC-JPの2バイト文字範囲
    if (
      (byte1 >= 0xA1 && byte1 <= 0xFE) &&
      (byte2 >= 0xA1 && byte2 <= 0xFE)
    ) {
      eucLikeBytes += 2;
      i++; // 2バイト文字なので次の文字をスキップ
    }
  }
  
  return eucLikeBytes / totalBytes > 0.1;
}

/**
 * ファイルのエンコーディングを自動検出
 */
export function detectFileEncoding(buffer: ArrayBuffer): DetectionResult {
  // ArrayBufferの検証
  if (!buffer || buffer.byteLength === 0) {
    return DetectionResultSchema.parse({
      encoding: 'utf-8',
      confidence: 0.5,
      method: 'default'
    });
  }
  
  // 1. BOM検出を優先
  const bomResult = detectBOM(buffer);
  if (bomResult) {
    return bomResult;
  }
  
  // 2. 統計的解析
  return detectStatistical(buffer);
}