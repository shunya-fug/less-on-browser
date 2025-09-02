import { LogGenRequestSchema, type LogGenRequest } from "$lib/schemas/LogGenRequest";
import { buildFilename, generateLogStream, type LogGenOptions } from "$lib/server/loggen";
import type { RequestHandler } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";

export const POST: RequestHandler = async ({ request }) => {
  let parsed: LogGenRequest;
  try {
    const json = await request.json();
    parsed = LogGenRequestSchema.parse(json);
  } catch (e) {
    throw error(400, "Invalid request");
  }

  const multiplier =
    parsed.sizeUnit === "GB" ? 1024 ** 3 : parsed.sizeUnit === "MB" ? 1024 ** 2 : parsed.sizeUnit === "KB" ? 1024 : 1;
  const totalSizeBytes = Math.max(1, Math.floor(parsed.size * multiplier));

  const opts: LogGenOptions = {
    format: parsed.format,
    totalSizeBytes,
    maxLineLength: parsed.maxLineLength && parsed.maxLineLength > 0 ? Math.floor(parsed.maxLineLength) : undefined,
    newline: parsed.newline,
    delimiter: parsed.delimiter,
    seed: parsed.seed && parsed.seed > 0 ? Math.floor(parsed.seed) : undefined,
    pattern: parsed.pattern,
    largeLineRatio: parsed.largeLineRatio,
    methodWeights: parsed.methodWeights,
    statusWeights: parsed.statusWeights,
    pathBaseList: parsed.pathBaseList,
    userAgents: parsed.userAgents,
    referrers: parsed.referrers,
  };

  const stream = generateLogStream(opts);
  const filename = buildFilename(parsed.format);

  return new Response(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
};
