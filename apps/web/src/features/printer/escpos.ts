/**
 * Builder ESC/POS minimal untuk printer thermal 58mm (32 karakter/baris, font A).
 * Hanya ASCII: karakter lain diganti agar printer murah tidak mencetak sampah.
 */
const ESC = 0x1b;
const GS = 0x1d;

export class EscPosBuilder {
  private bytes: number[] = [];

  constructor(private readonly width = 32) {
    this.bytes.push(ESC, 0x40); // init
  }

  text(value: string) {
    const ascii = value.normalize('NFKD').replace(/[^\x20-\x7e\n]/g, '');
    for (const ch of ascii) this.bytes.push(ch.charCodeAt(0));
    return this;
  }

  line(value = '') {
    return this.text(value + '\n');
  }

  align(mode: 'left' | 'center' | 'right') {
    this.bytes.push(ESC, 0x61, { left: 0, center: 1, right: 2 }[mode]);
    return this;
  }

  bold(on: boolean) {
    this.bytes.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  /** Tinggi & lebar ganda untuk TOTAL. */
  size(mode: 'normal' | 'double') {
    this.bytes.push(GS, 0x21, mode === 'double' ? 0x11 : 0x00);
    return this;
  }

  divider(char = '-') {
    return this.line(char.repeat(this.width));
  }

  /** "Subtotal" ............ "104.000" rata kanan dalam satu baris. */
  pair(left: string, right: string) {
    const space = Math.max(1, this.width - left.length - right.length);
    return this.line(left + ' '.repeat(space) + right);
  }

  feed(lines = 3) {
    this.bytes.push(ESC, 0x64, lines);
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}
