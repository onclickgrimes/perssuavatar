const fontName = "Pricedown";
const fontUrl = "http://localhost:9999/fonts/Pricedown-Bl.otf";

if (typeof window !== "undefined" && "FontFace" in window) {
  const font = new FontFace(
    fontName,
    `url('${fontUrl}') format('opentype')`
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
