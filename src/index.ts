import UAParser from "ua-parser-js";

export type UserProxyClientOptions = {
  allowLocalIp?: boolean;
  devIpOverride?: string;
  geoResolver?: (
    req: { headers: { get(name: string): string | null } },
    ip: string | null,
  ) => GeoInfo;
};

export type IpInfo = {
  ip: string | null;
  ipv4: string | null;
  ipv6: string | null;
  ipv4Number: number | null;
  isPublic: boolean;
  source: "headers" | "override" | "none";
};

export type GeoInfo = {
  country: string;
  countryCode: string;
  area: string;
  city: string;
  continent: string;
  inEU: boolean | null;
};

export type DeviceInfo = {
  deviceName: string;
  deviceType: string;
  os: string;
  browser: string;
  vendor: string;
  model: string;
};

export type UserProxy = {
  ip: string | null;
  ipv4: string | null;
  ipv6: string | null;
  ipv4Number: number | null;
  country: string;
  area: string;
  city: string;
  deviceName: string;
};

export function createUserProxyClient(opts: UserProxyClientOptions = {}) {
  const allowLocalIp = opts.allowLocalIp ?? true;
  const devIpOverride = opts.devIpOverride;
  const geoResolver = opts.geoResolver ?? vercelHeaderGeoResolver;

  async function ipInfo(req: {
    headers: { get(name: string): string | null };
  }): Promise<IpInfo> {
    const headerIp = getClientIp(req);

    if (devIpOverride && isPublicIp(devIpOverride)) {
      return buildIpInfo(devIpOverride, "override");
    }

    if (!headerIp) {
      return {
        ip: null,
        ipv4: null,
        ipv6: null,
        ipv4Number: null,
        isPublic: false,
        source: "none",
      };
    }

    if (!allowLocalIp && isLocalIp(headerIp)) {
      return {
        ip: null,
        ipv4: null,
        ipv6: null,
        ipv4Number: null,
        isPublic: false,
        source: "none",
      };
    }

    return buildIpInfo(headerIp, "headers");
  }

  async function deviceInfo(req: {
    headers: { get(name: string): string | null };
  }): Promise<DeviceInfo> {
    const ua = req.headers.get("user-agent");
    return parseDevice(ua);
  }

  async function geoInfo(req: {
    headers: { get(name: string): string | null };
  }): Promise<GeoInfo> {
    const ip = (await ipInfo(req)).ip;
    return geoResolver(req, ip);
  }

  async function userProxy(req: {
    headers: { get(name: string): string | null };
  }): Promise<UserProxy> {
    const [ip, geo, dev] = await Promise.all([
      ipInfo(req),
      geoInfo(req),
      deviceInfo(req),
    ]);

    return {
      ip: ip.ip,
      ipv4: ip.ipv4,
      ipv6: ip.ipv6,
      ipv4Number: ip.ipv4Number,
      country: geo.country,
      area: geo.area,
      city: geo.city,
      deviceName: dev.deviceName,
    };
  }

  return {
    ipInfo,
    geoInfo,
    deviceInfo,
    userProxy,
  };
}

function vercelHeaderGeoResolver(
  req: { headers: { get(name: string): string | null } },
  _ip: string | null,
): GeoInfo {
  const countryCode = safeStr(
    req.headers.get("x-vercel-ip-country"),
  ).toUpperCase();
  const area = safeStr(req.headers.get("x-vercel-ip-country-region"));
  const city = safeStr(req.headers.get("x-vercel-ip-city"));
  const continent = safeStr(
    req.headers.get("x-vercel-ip-continent"),
  ).toUpperCase();
  const postal = safeStr(req.headers.get("x-vercel-ip-postal-code"));
  const inEU = parseBool(req.headers.get("x-vercel-ip-eu"));

  const country = countryCode ? countryNameFromIso2(countryCode) : "";

  return {
    country,
    countryCode,
    area: area || postal ? area : area,
    city,
    continent,
    inEU,
  };
}

function countryNameFromIso2(code: string): string {
  const map: Record<string, string> = {
    CZ: "Czechia",
    SK: "Slovakia",
    PL: "Poland",
    DE: "Germany",
    AT: "Austria",
    US: "United States",
    GB: "United Kingdom",
    UA: "Ukraine",
    FR: "France",
    IT: "Italy",
    ES: "Spain",
    NL: "Netherlands",
    BE: "Belgium",
    SE: "Sweden",
    NO: "Norway",
    FI: "Finland",
    DK: "Denmark",
    CH: "Switzerland",
    CA: "Canada",
  };
  return map[code] ?? code;
}

function parseBool(v: string | null): boolean | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  return null;
}

function buildIpInfo(ip: string, source: IpInfo["source"]): IpInfo {
  const v4 = isIPv4(ip) ? ip : null;
  const v6 = isIPv6(ip) ? ip : null;

  return {
    ip,
    ipv4: v4,
    ipv6: v6,
    ipv4Number: v4 ? ipv4ToNumber(v4) : null,
    isPublic: isPublicIp(ip),
    source,
  };
}

function getClientIp(req: {
  headers: { get(name: string): string | null };
}): string | null {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return normalizeIp(cf);

  const xff =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-vercel-forwarded-for");
  if (xff) return normalizeIp(xff.split(",")[0].trim());

  const xri = req.headers.get("x-real-ip");
  if (xri) return normalizeIp(xri);

  return null;
}

function normalizeIp(ip: string): string {
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  const percent = ip.indexOf("%");
  if (percent !== -1) return ip.slice(0, percent);
  return ip;
}

function isIPv4(ip: string): boolean {
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return false;
  const parts = ip.split(".").map((x) => Number(x));
  return (
    parts.length === 4 &&
    parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
  );
}

function isIPv6(ip: string): boolean {
  if (!ip.includes(":")) return false;
  if (ip.startsWith("::ffff:")) return false;
  return true;
}

function isLocalIp(ip: string): boolean {
  if (ip === "::1" || ip === "127.0.0.1") return true;
  if (isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
  }
  const lower = ip.toLowerCase();
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  return false;
}

function isPublicIp(ip: string): boolean {
  return !isLocalIp(ip);
}

function ipv4ToNumber(ip: string): number {
  return (
    ip
      .split(".")
      .map(Number)
      .reduce((acc, octet) => (acc << 8) + octet, 0) >>> 0
  );
}

function parseDevice(ua: string | null): DeviceInfo {
  if (!ua) {
    return {
      deviceName: "Unknown device",
      deviceType: "unknown",
      os: "",
      browser: "",
      vendor: "",
      model: "",
    };
  }

  const parser = new UAParser(ua);
  const device = parser.getDevice();
  const os = parser.getOS();
  const browser = parser.getBrowser();

  const deviceType = safeStr(device?.type) || "Desktop";
  const vendor = safeStr(device?.vendor);
  const model = safeStr(device?.model);

  const osStr = [safeStr(os?.name), safeStr(os?.version)]
    .filter(Boolean)
    .join(" ");
  const browserStr = [safeStr(browser?.name), safeStr(browser?.version)]
    .filter(Boolean)
    .join(" ");

  const nameParts = [
    deviceType,
    vendor || model ? `${vendor} ${model}`.trim() : "",
    osStr ? `(${osStr})` : "",
    browserStr ? `— ${browserStr}` : "",
  ].filter(Boolean);

  return {
    deviceName: nameParts.join(" "),
    deviceType,
    os: osStr,
    browser: browserStr,
    vendor,
    model,
  };
}

function safeStr(v: any): string {
  return typeof v === "string" ? v : "";
}
