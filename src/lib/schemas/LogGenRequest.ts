import { z } from "zod";

export const SizeUnitEnum = z.enum(["B", "KB", "MB", "GB"]);
export const LogFormatEnum = z.enum(["apache-common", "apache-combined", "tomcat-access", "custom"]);
export const NewlineEnum = z.enum(["\n", "\r\n"]);
export const DelimiterEnum = z.enum(["space", "tab", "comma", "pipe"]);

export const LogGenRequestSchema = z.object({
  format: LogFormatEnum.default("apache-combined"),
  size: z.number().int().min(1),
  sizeUnit: SizeUnitEnum.default("MB"),
  maxLineLength: z.number().int().min(0).optional(),
  newline: NewlineEnum.default("\n"),
  delimiter: DelimiterEnum.default("space"),
  seed: z.number().int().positive().optional(),
  largeLineRatio: z.number().min(0).max(1).default(0.02),
  pattern: z.string().optional(),
  // Optional advanced knobs (not exposed in UI yet)
  methodWeights: z.record(z.string(), z.number()).optional(),
  statusWeights: z.record(z.string(), z.number()).optional(),
  pathBaseList: z.array(z.string()).optional(),
  userAgents: z.array(z.string()).optional(),
  referrers: z.array(z.string()).optional(),
});

export type LogGenRequest = z.infer<typeof LogGenRequestSchema>;
