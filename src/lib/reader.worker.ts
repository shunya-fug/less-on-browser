import { MessageTypeEnum } from "$lib/schemas/ReaderWorkerMessage";
import * as ReaderWorkerMessageType from "$lib/types/ReaderWorkerMessage";

const DEFAULT_ENCODING = "utf-8";

let file: File | null = null;
let lineStartList: number[] = [];
let lineCount = 0;
let encoding = DEFAULT_ENCODING;
let newline = getNewlinePattern(encoding);

self.onmessage = async (event: MessageEvent<ReaderWorkerMessageType.CreateIndex | ReaderWorkerMessageType.Read>) => {
  const message = event.data;

  switch (message.messageType) {
    case MessageTypeEnum.enum.CreateIndex:
      file = message.file;
      encoding = message.encoding || DEFAULT_ENCODING;
      newline = getNewlinePattern(encoding);
      lineStartList = [0]; // Start with position 0 for the first line
      lineCount = 0;

      const chunkSize = message.chunkSize ?? 1024 * 1024;
      const fileSize = file.size;
      let carry = new Uint8Array(0);

      for (let pos = 0; pos < fileSize; pos += chunkSize) {
        const end = Math.min(pos + chunkSize, fileSize);
        const raw = new Uint8Array(await file.slice(pos, end).arrayBuffer());
        const cur = new Uint8Array(carry.length + raw.length);
        cur.set(carry, 0);
        cur.set(raw, carry.length);

        for (let i = 0; i <= cur.length - newline.length; i++) {
          let ok = true;
          for (let j = 0; j < newline.length; j++) {
            if (cur[i + j] !== newline[j]) {
              ok = false;
              break;
            }
          }
          if (ok) {
            const newlineEnd = pos - carry.length + i + newline.length;
            lineStartList.push(newlineEnd);
            i += newline.length - 1;
          }
        }

        carry = cur.slice(Math.max(0, cur.length - newline.length + 1));

        // 処理状況通知
        self.postMessage({
          messageType: MessageTypeEnum.enum.CreateIndexStatus,
          doneBytes: end,
          fileSize,
        } as ReaderWorkerMessageType.CreateIndexStatus);
      }

      // 処理完了通知
      // Calculate line count based on lineStartList
      if (file.size > 0 && lineStartList[lineStartList.length - 1] < file.size) {
        // File doesn't end with newline, so the number of lines equals lineStartList.length
        lineCount = lineStartList.length;
      } else {
        // File ends with newline, so the last entry in lineStartList points to an empty line
        lineCount = lineStartList.length - 1;
      }
      self.postMessage({
        messageType: MessageTypeEnum.enum.CreateIndexResult,
        lineCount,
        fileSize,
      } as ReaderWorkerMessageType.CreateIndexResult);
      break;

    case MessageTypeEnum.enum.Read:
      if (!file) {
        return;
      }

      const { lineStart, count } = message;
      const lineEnd = Math.min(lineStart + count, lineCount);
      const { byteStart, byteEnd } = calculateByteRange(lineStart, lineEnd);
      const arrayBuffer = await file.slice(byteStart, byteEnd).arrayBuffer();
      const decoder = new TextDecoder(encoding, { ignoreBOM: true, fatal: false });
      const text = decoder.decode(arrayBuffer);
      const lines = text.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
      // 読取結果通知
      self.postMessage({
        messageType: MessageTypeEnum.enum.ReadResult,
        lineStart,
        lines,
      } as ReaderWorkerMessageType.ReadResult);
      break;
  }
};

function getNewlinePattern(encoding: string): Uint8Array {
  switch (encoding.toLowerCase()) {
    case "utf-16le":
      return new Uint8Array([0x0a, 0x00]);
    case "utf-16be":
      return new Uint8Array([0x00, 0x0a]);
    default:
      return new Uint8Array([0x0a]);
  }
}

function calculateByteRange(lineStart: number, lineEnd: number) {
  // lineStart and lineEnd are 0-based line numbers
  // lineEnd is exclusive (not included in the range)
  
  let byteStart: number;
  let byteEnd: number;
  
  // Get byte start position for lineStart
  if (lineStart >= 0 && lineStart < lineStartList.length) {
    byteStart = lineStartList[lineStart];
  } else {
    byteStart = file!.size;
  }
  
  // Get byte end position for lineEnd (exclusive)
  if (lineEnd >= 0 && lineEnd < lineStartList.length) {
    byteEnd = lineStartList[lineEnd];
  } else {
    byteEnd = file!.size;
  }
  
  return { byteStart, byteEnd };
}
