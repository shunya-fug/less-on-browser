import { dev } from "$app/environment";
import type { Handle } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
  // /local 以下はローカルでのみアクセス可能
  if (!dev && event.url.pathname.startsWith("/local")) {
    return new Response("Not Found", { status: 404 });
  }
  return resolve(event);
};
