import { describe, test, expect, mock, afterEach } from "bun:test";

afterEach(() => {
  mock.restore();
});

describe("handle", () => {
  test("dev=false で /local/sample が 404 になる", async () => {
    mock.module("$app/environment", () => ({ dev: false }));
    const { handle } = await import("../src/hooks.server");
    const event = { url: new URL("http://example.com/local/sample") } as any;
    const resolve = mock(() => new Response("ok"));
    const response = await handle({ event, resolve });
    expect(response.status).toBe(404);
    expect(resolve).not.toHaveBeenCalled();
  });

  test("dev=true で通常どおり処理される", async () => {
    mock.module("$app/environment", () => ({ dev: true }));
    const { handle } = await import("../src/hooks.server");
    const event = { url: new URL("http://example.com/local/sample") } as any;
    const resolve = mock(() => Promise.resolve(new Response("ok")));
    const response = await handle({ event, resolve });
    expect(resolve).toHaveBeenCalledWith(event);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  test("dev=false でも /local 以外は通常処理される", async () => {
    mock.module("$app/environment", () => ({ dev: false }));
    const { handle } = await import("../src/hooks.server");
    const event = { url: new URL("http://example.com/public") } as any;
    const resolve = mock(() => Promise.resolve(new Response("ok")));
    const response = await handle({ event, resolve });
    expect(resolve).toHaveBeenCalledWith(event);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });
});
