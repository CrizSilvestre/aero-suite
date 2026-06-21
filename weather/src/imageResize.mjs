// src/imageResize.mjs — browser-only. Reads the image as-is (no resize, no
// quality loss) and returns a base64 data URL ready to embed in the .eml.
// Dimensions are read for metadata only.

export async function resizeImage(file) {
  const bitmap = await createImageBitmap(file);
  const width = bitmap.width;
  const height = bitmap.height;
  bitmap.close?.();

  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });

  const mime = file.type || 'image/png';
  return { dataUrl, width, height, mime, bytes: file.size };
}
