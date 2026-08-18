/** Barras para imprimir: EAN-13 si el código es válido; si no, Code128-B. */

const EAN_L = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
];
const EAN_G = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111',
];
const EAN_R = [
  '1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100',
];
const EAN_PARITY = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
];

const C128_PATTERNS = [
  '11011001100','11001101100','11001100110','10010011000','10010001100','10001001100','10011001000','10011000100','10001100100','11001001000',
  '11001000100','11000100100','10110011100','10011011100','10011001110','10111001100','10011101100','10011100110','11001110010','11001011100',
  '11001001110','11011100100','11001110100','11101101110','11101001100','11100101100','11100100110','11101100100','11100110100','11100110010',
  '11011011000','11011000110','11000110110','10100011000','10001011000','10001000110','10110001000','10001101000','10001100010','11010001000',
  '11000101000','11000100010','10110111000','10110001110','10001101110','10111011000','10111000110','10001110110','11101110110','11010001110',
  '11000101110','11011101000','11011100010','11011101110','11101011000','11101000110','11100010110','11101101000','11101100010','11100011010',
  '11101111010','11001000010','11110001010','10100110000','10100001100','10010110000','10010000110','10000101100','10000100110','10110010000',
  '10110000100','10011010000','10011000010','10000110100','10000110010','11000010010','11001010000','11110111010','11000010100','10001111010',
  '10100111100','10010111100','10010011110','10111100100','10011110100','10011110010','11110100100','11110010100','11110010010','11011011110',
  '11011110110','11110110110','10101111000','10100011110','10001011110','10111101000','10111100010','11110101000','11110100010','10111011110',
  '10111101110','11101011110','11110101110','11010000100','11010010000','11010011100','1100011101011',
];

function ean13CheckDigit(twelve: string): string {
  const digits = twelve.replace(/\D/g, '').slice(0, 12).padStart(12, '0').split('').map(Number);
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

export function isEan13(value: string): boolean {
  const code = value.replace(/\D/g, '');
  if (code.length !== 13) return false;
  return code === code.slice(0, 12) + ean13CheckDigit(code.slice(0, 12));
}

function barsToSvg(pattern: string, module = 1.2, height = 36, stretch = false): string {
  let x = 0;
  const rects: string[] = [];
  for (const bit of pattern) {
    if (bit === '1') rects.push(`<rect x="${x}" y="0" width="${module}" height="${height}"/>`);
    x += module;
  }
  const width = pattern.length * module;
  const wAttr = stretch ? '100%' : String(width);
  const fit = stretch ? 'none' : 'xMidYMid meet';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${wAttr}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="${fit}" shape-rendering="crispEdges" aria-hidden="true">${rects.join('')}</svg>`;
}

export function ean13Svg(code: string, module = 1.15, height = 34, stretch = false): string {
  const digits = code.replace(/\D/g, '');
  if (digits.length !== 13) return '';
  const parity = EAN_PARITY[Number(digits[0])];
  let pattern = '101';
  for (let i = 0; i < 6; i += 1) {
    const table = parity[i] === 'G' ? EAN_G : EAN_L;
    pattern += table[Number(digits[i + 1])];
  }
  pattern += '01010';
  for (let i = 7; i < 13; i += 1) pattern += EAN_R[Number(digits[i])];
  pattern += '101';
  return barsToSvg(pattern, module, height, stretch);
}

function code128BValue(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code >= 32 && code <= 127) return code - 32;
  return -1;
}

export function code128Svg(text: string, module = 1.05, height = 34, stretch = false): string {
  const chars = [...text].filter((ch) => code128BValue(ch) >= 0);
  if (!chars.length) return '';
  const values = [104, ...chars.map((ch) => code128BValue(ch))];
  let checksum = values[0];
  for (let i = 1; i < values.length; i += 1) checksum += values[i] * i;
  values.push(checksum % 103, 106);
  const pattern = values.map((v) => C128_PATTERNS[v]).join('');
  return barsToSvg(pattern, module, height, stretch);
}

export function barcodeSvg(code: string, module?: number, height?: number, stretch = false): string {
  const trimmed = code.trim();
  if (!trimmed) return '';
  if (isEan13(trimmed)) return ean13Svg(trimmed, module, height, stretch);
  return code128Svg(trimmed, module, height, stretch);
}
