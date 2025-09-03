import { z } from "zod";
import { EncodingValueSchema } from "./encodings.js";

export const MessageTypeEnum = z.enum(["CreateIndex", "CreateIndexStatus", "CreateIndexResult", "Read", "ReadResult"]);

export const CreateIndex = z.object({
  messageType: z.literal(MessageTypeEnum.enum.CreateIndex),
  file: z.file(),
  encoding: EncodingValueSchema.optional(),
  chunkSize: z.number().min(1).optional(),
});

export const CreateIndexStatus = z.object({
  messageType: z.literal(MessageTypeEnum.enum.CreateIndexStatus),
  doneBytes: z.number().min(0),
  fileSize: z.number().min(0),
});

export const CreateIndexResult = z.object({
  messageType: z.literal(MessageTypeEnum.enum.CreateIndexResult),
  lineCount: z.number().min(0),
  fileSize: z.number().min(0),
});

export const Read = z.object({
  messageType: z.literal(MessageTypeEnum.enum.Read),
  lineStart: z.number().min(0),
  count: z.number().min(1),
});

export const ReadResult = z.object({
  messageType: z.literal(MessageTypeEnum.enum.ReadResult),
  lineStart: z.number().min(0),
  lines: z.array(z.string()),
});
