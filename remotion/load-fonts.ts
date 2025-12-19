import { staticFile } from "remotion";

const fontName = "Pricedown";
const fontPath = "fonts/Pricedown-Bl.otf";

if (typeof window !== "undefined" && "FontFace" in window) {
  const font = new FontFace(
    fontName,
    `url('${staticFile(fontPath)}') format('opentype')`
  );

  font
    .load()
    .then(() => {
      document.fonts.add(font);
      console.log(`Font ${fontName} loaded successfully!`);
    })
    .catch((err) => {
      console.error(`Error loading font ${fontName}`, err);
    });
}
