import { CreateIndex, CreateIndexStatus, CreateIndexResult, Read, ReadResult } from "$lib/schemas/ReaderWorkerMessage";
import { z } from "zod";

export type CreateIndex = z.infer<typeof CreateIndex>;

export type CreateIndexStatus = z.infer<typeof CreateIndexStatus>;

export type CreateIndexResult = z.infer<typeof CreateIndexResult>;

export type Read = z.infer<typeof Read>;

export type ReadResult = z.infer<typeof ReadResult>;

export function isCreateIndex(message: unknown): message is CreateIndex {
  return CreateIndex.safeParse(message).success;
}

export function isCreateIndexStatus(message: unknown): message is CreateIndexStatus {
  return CreateIndexStatus.safeParse(message).success;
}

export function isCreateIndexResult(message: unknown): message is CreateIndexResult {
  return CreateIndexResult.safeParse(message).success;
}

export function isRead(message: unknown): message is Read {
  return Read.safeParse(message).success;
}

export function isReadResult(message: unknown): message is ReadResult {
  return ReadResult.safeParse(message).success;
}
