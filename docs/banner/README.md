# Huddle Buy Me a Coffee Banners

This folder contains 5 high-quality banner designs for the Huddle Buy Me a Coffee page. 
All banners are 1600px wide and 400px tall.

## Banner Designs

Each design is provided in both **SVG** (vector) and **PNG** (high-quality raster) formats. Use the **PNG** files for platforms like Buy Me a Coffee that do not support SVG.

1. **Modern Minimal** ([SVG](./banner1-modern-minimal.svg) | [PNG](./banner1-modern-minimal.png)): A clean design featuring the Huddle logo, brand colors, and a subtle hexagonal background pattern.
2. **Game Grid** ([SVG](./banner2-game-grid.svg) | [PNG](./banner2-game-grid.png)): A dark-themed banner with floating game icons (Bomber, Trivia, Snake, Sketch) and a technical grid background.
3. **Party Vibe** ([SVG](./banner3-party-vibe.svg) | [PNG](./banner3-party-vibe.png)): A bright, friendly design with abstract shapes and the colorful Huddle grid logo.
4. **Game Lineup** ([SVG](./banner4-game-lineup.svg) | [PNG](./banner4-game-lineup.png)): A clean layout showcasing the variety of games available in the Huddle Play Room.
5. **Retro-Tech** ([SVG](./banner5-retro-tech.svg) | [PNG](./banner5-retro-tech.png)): A monospace-heavy "tech" style design focusing on the "ICE BREAKER" brand.

## How to Use

### Recommended: PNG
Upload the `.png` files directly to your Buy Me a Coffee account. These have been generated at 1600x400px with maximum quality to ensure text remains crisp.

### Converting to PNG
If you need a PNG or JPEG file (e.g., if the platform doesn't support SVG), you can:

1. **Browser Export**: Open the `.svg` file in any web browser, then use a screenshot tool or "Save Page As" (if supported).
2. **Online Converters**: Use tools like [CloudConvert](https://cloudconvert.com/svg-to-png) or [SVGtoPNG.com](https://svgtopng.com/).
3. **CLI (Command Line)**:
   If you have `rsvg-convert` (part of `librsvg`) installed:
   ```bash
   rsvg-convert -w 1600 -h 400 banner1-modern-minimal.svg -o banner1.png
   ```

## Design Specifications
- **Aspect Ratio**: 4:1
- **Dimensions**: 1600px x 400px (Vector)
- **Primary Font**: Courier New / Monospace
- **Brand Colors**:
  - Background: `#f4f1ea`
  - Text/Dark: `#2a2a2a`
  - Accent Blue: `#3d5a80`
  - Accent Red: `#c04b3a`
  - Accent Green: `#5a7d3a`
