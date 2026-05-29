import QRCode from "qrcode";

const CODE128_PATTERNS = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112",
] as const;

export function normalizeBarcodeToken(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function productCodeFromName(name: string): string {
  const words = name.toUpperCase().match(/[A-Z0-9]+/g) || ["ITEM"];
  return words.map((word) => word.slice(0, 3)).join("").slice(0, 10) || "ITEM";
}

export function generateBatchCode(productName: string, date = new Date(), random = Math.random()): string {
  const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.floor(random * 36 ** 4).toString(36).toUpperCase().padStart(4, "0");
  return `CB-BTCH-${yyyymmdd}-${productCodeFromName(productName)}-${randomPart}`;
}

export function code128Modules(value: string): string {
  const normalized = normalizeBarcodeToken(value);
  if (!normalized) return "";

  const codes = [104, ...Array.from(normalized).map((char) => {
    const code = char.charCodeAt(0);
    if (code < 32 || code > 126) throw new Error("Code 128 supports printable ASCII only");
    return code - 32;
  })];

  const checksum = codes.reduce((sum, code, index) => sum + (index === 0 ? code : code * index), 0) % 103;
  return [...codes, checksum, 106].map((code) => CODE128_PATTERNS[code]).join("");
}

export function code128SvgDataUri(value: string, height = 54): string {
  const modules = code128Modules(value);
  let x = 0;
  const rects: string[] = [];

  for (let i = 0; i < modules.length; i += 1) {
    const width = Number(modules[i]);
    if (i % 2 === 0) rects.push(`<rect x="${x}" y="0" width="${width}" height="${height}"/>`);
    x += width;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} ${height}" preserveAspectRatio="none">${rects.join("")}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function qrCodeDataUri(value: string): Promise<string> {
  return QRCode.toDataURL(normalizeBarcodeToken(value), {
    errorCorrectionLevel: "H",
    margin: 3,
    scale: 8,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  });
}
