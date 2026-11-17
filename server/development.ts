const localHosts = ["localhost", "127.0.0.1", "[::1]"];
// Version URLs belong to this demo Worker only; never accept arbitrary workers.dev hosts.
export function isDevelopmentHost(host: string): boolean {
  return (
    localHosts.includes(host) ||
    host === "demo.korzina.app" ||
    /^[a-z0-9-]+-korzina-demo\.vir2ozz2009\.workers\.dev$/.test(host)
  );
}

export function isDemoPath(path: string): boolean {
  return /^\/(?:dev(?:\/|$)|p\/demo(?:\/|$)|seller\/orders\/demo(?:\/|$))/.test(path);
}
