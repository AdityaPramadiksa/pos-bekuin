/**
 * Label di atas kepala agent dirender di satu overlay DOM (di luar Canvas) dan posisinya
 * diproyeksikan dari dunia 3D tiap frame lewat ref. Menghindari satu React root per label
 * (drei <Html>) dan tidak memicu re-render React saat kamera bergerak.
 */
export const labelRegistry = new Map<string, HTMLDivElement>();
