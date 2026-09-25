import { detectImageType } from './uploads.service';

describe('detectImageType', () => {
  it('mengenali JPG, PNG, dan WebP dari magic bytes', () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(
      'png',
    );
    expect(detectImageType(Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'binary'))).toBe('webp');
  });

  it('menolak file yang bukan gambar walau namanya .jpg', () => {
    expect(detectImageType(Buffer.from('<?php echo 1; ?>'))).toBeNull();
    expect(detectImageType(Buffer.from([0x25, 0x50, 0x44, 0x46]))).toBeNull(); // PDF
  });
});
