export type LogFormat = "apache-common" | "apache-combined" | "tomcat-access" | "custom";

export type LogGenOptions = {
  format: LogFormat;
  totalSizeBytes: number;
  maxLineLength?: number; // If set, occasionally generate long lines up to this length
  newline?: "\n" | "\r\n";
  delimiter?: "space" | "tab" | "comma" | "pipe";
  seed?: number; // For reproducibility
  pattern?: string; // Used when format === 'custom'
  largeLineRatio?: number; // 0..1 ratio of lines that attempt max length
  methodWeights?: Record<string, number>;
  statusWeights?: Record<string, number>;
  pathBaseList?: string[]; // base paths to sample from
  userAgents?: string[];
  referrers?: string[];
};

const DEFAULT_METHOD_WEIGHTS: Record<string, number> = {
  GET: 70,
  POST: 20,
  PUT: 4,
  PATCH: 2,
  DELETE: 4,
};

const DEFAULT_STATUS_WEIGHTS: Record<string, number> = {
  "200": 80,
  "201": 2,
  "204": 2,
  "301": 1,
  "302": 1,
  "304": 5,
  "400": 2,
  "401": 1,
  "403": 1,
  "404": 4,
  "429": 0.5,
  "500": 0.8,
  "503": 0.7,
};

const DEFAULT_PATH_BASES = [
  "/",
  "/api",
  "/assets",
  "/login",
  "/logout",
  "/products",
  "/search",
  "/admin",
  "/download",
  "/upload",
];

const DEFAULT_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "curl/8.7.1",
  "Wget/1.21.4 (linux-gnu)",
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0",
  "PostmanRuntime/7.39.0",
];

const DEFAULT_REFERRERS = [
  "-",
  "https://www.google.com/",
  "https://www.bing.com/",
  "https://example.com/",
  "https://github.com/",
];

// Lightweight seeded PRNG
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T extends string | number>(rng: () => number, weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((s, [, w]) => s + (w > 0 ? w : 0), 0);
  let r = rng() * total;
  for (const [key, w] of entries) {
    if (w <= 0) continue;
    if (r < w) return key;
    r -= w;
  }
  return entries[0][0];
}

function randomInt(rng: () => number, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randomIP(rng: () => number) {
  // Avoid reserved ranges a bit
  const octet = () => randomInt(rng, 1, 254);
  return `${octet()}.${octet()}.${octet()}.${octet()}`;
}

function randomUser(rng: () => number) {
  const names = ["alice", "bob", "carol", "dave", "erin", "frank", "-"];
  return names[Math.floor(rng() * names.length)];
}

function randomIdent(rng: () => number) {
  return "-";
}

function randomPath(rng: () => number, bases: string[]) {
  const base = bases[Math.floor(rng() * bases.length)] || "/";
  const segments = randomInt(rng, 0, 4);
  const parts: string[] = [base];
  for (let i = 0; i < segments; i++) {
    const id = randomInt(rng, 1, 9999).toString(36);
    parts.push(id);
  }
  const qsPairs = randomInt(rng, 0, 3);
  let path = parts.join("/").replace(/\/+/g, "/");
  if (qsPairs > 0) {
    const q: string[] = [];
    for (let i = 0; i < qsPairs; i++) {
      q.push(`k${randomInt(rng, 1, 9)}=v${randomInt(rng, 1, 999)}`);
    }
    path += `?${q.join("&")}`;
  }
  return path;
}

function formatApacheCommon(
  date: Date,
  host: string,
  ident: string,
  user: string,
  request: string,
  status: number,
  bytes: number,
  sep: string
) {
  const time = dateToApacheTime(date);
  return [host, ident, user, `[${time}]`, `"${request}"`, String(status), String(bytes)].join(sep);
}

function formatApacheCombined(
  date: Date,
  host: string,
  ident: string,
  user: string,
  request: string,
  status: number,
  bytes: number,
  referrer: string,
  agent: string,
  sep: string
) {
  const time = dateToApacheTime(date);
  return [
    host,
    ident,
    user,
    `[${time}]`,
    `"${request}"`,
    String(status),
    String(bytes),
    `"${referrer}"`,
    `"${agent}"`,
  ].join(sep);
}

function formatTomcatAccess(
  date: Date,
  host: string,
  ident: string,
  user: string,
  request: string,
  status: number,
  bytes: number,
  responseTimeMs: number,
  sep: string
) {
  const time = dateToApacheTime(date);
  // Tomcat default AccessLogValve pattern roughly: %h %l %u %t "%r" %s %b %D
  return [host, ident, user, `[${time}]`, `"${request}"`, String(status), String(bytes), String(responseTimeMs)].join(
    sep
  );
}

function dateToApacheTime(date: Date) {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const MMM = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getUTCMonth()];
  const yyyy = date.getUTCFullYear();
  const HH = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${dd}/${MMM}/${yyyy}:${HH}:${mm}:${ss} +0000`;
}

function applyMaxLine(line: string, maxLen?: number, rng?: () => number, enforce = false): string {
  if (!maxLen || maxLen <= 0) return line;
  if (line.length >= maxLen) return line.slice(0, maxLen);
  if (!rng) return line;
  // Occasionally pad with random characters if enforce
  if (enforce) {
    const padLen = Math.max(0, maxLen - line.length);
    return line + randomFill(rng, padLen);
  }
  return line;
}

function randomFill(rng: () => number, len: number) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_/.:?=&%";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(rng() * chars.length)];
  return out;
}

function formatCustom(pattern: string, ctx: Record<string, string | number>) {
  return pattern.replace(/\{(\w+)\}/g, (_, k) => String(ctx[k] ?? ""));
}

export function buildFilename(format: LogFormat) {
  const ts = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  return `dummy-${format}-${ts}.log`;
}

export function generateLogStream(opts: LogGenOptions): ReadableStream<Uint8Array> {
  const {
    format,
    totalSizeBytes,
    maxLineLength,
    newline = "\n",
    delimiter = "space",
    seed = Math.floor(Math.random() * 2 ** 31),
    pattern,
    largeLineRatio = 0.02,
    methodWeights = DEFAULT_METHOD_WEIGHTS,
    statusWeights = DEFAULT_STATUS_WEIGHTS,
    pathBaseList = DEFAULT_PATH_BASES,
    userAgents = DEFAULT_AGENTS,
    referrers = DEFAULT_REFERRERS,
  } = opts;

  const rng = mulberry32(seed);
  const encoder = new TextEncoder();
  let produced = 0;
  let now = Date.now();

  const sep = delimiter === "tab" ? "\t" : delimiter === "comma" ? "," : delimiter === "pipe" ? "|" : " ";

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      // Generate a batch of lines to keep pulling efficient
      let chunk = "";
      const targetBatch = 64; // lines per batch
      for (let i = 0; i < targetBatch && produced < totalSizeBytes; i++) {
        const host = randomIP(rng);
        const ident = randomIdent(rng);
        const user = randomUser(rng);
        const method = pickWeighted(rng, methodWeights) as string;
        const path = randomPath(rng, pathBaseList);
        const protocol = "HTTP/1.1";
        const status = Number(pickWeighted(rng, statusWeights));
        const bytes = Math.max(0, Math.floor(1024 * Math.pow(rng(), 3))); // many small, some larger
        const agent = userAgents[Math.floor(rng() * userAgents.length)];
        const ref = referrers[Math.floor(rng() * referrers.length)];
        const responseTimeMs = Math.floor(Math.pow(rng(), 2) * 3000); // biased towards small
        const date = new Date(now);
        now += randomInt(rng, 1, 1200); // advance by up to 1.2s

        const request = `${method} ${path} ${protocol}`;

        let line: string;
        switch (format) {
          case "apache-common":
            line = formatApacheCommon(date, host, ident, user, request, status, bytes, sep);
            break;
          case "apache-combined":
            line = formatApacheCombined(date, host, ident, user, request, status, bytes, ref, agent, sep);
            break;
          case "tomcat-access":
            line = formatTomcatAccess(date, host, ident, user, request, status, bytes, responseTimeMs, sep);
            break;
          case "custom":
            line = formatCustom(pattern || '{host} {ident} {user} [{time}] "{request}" {status} {bytes}', {
              host,
              ident,
              user,
              time: dateToApacheTime(date),
              request,
              status,
              bytes,
              referrer: ref,
              agent,
              responseTimeMs,
            });
            break;
        }

        const makeLarge = rng() < largeLineRatio;
        line = applyMaxLine(line, maxLineLength, rng, makeLarge);

        chunk += line + newline;

        // If chunk is getting large, flush early
        if (chunk.length > 32 * 1024) {
          break;
        }
      }

      const buf = encoder.encode(chunk);
      produced += buf.byteLength;

      if (buf.byteLength > 0) {
        controller.enqueue(buf);
      }
      if (produced >= totalSizeBytes) {
        controller.close();
      }
    },
  });
}
