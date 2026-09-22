import fs from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';

const svgPath = path.resolve('public/icon.svg');
const svgBuffer = fs.readFileSync(svgPath);

const maskableSvgPath = path.resolve('public/icon-maskable.svg');
const maskableSvgBuffer = fs.existsSync(maskableSvgPath) ? fs.readFileSync(maskableSvgPath) : svgBuffer;

function generatePng(sourceBuffer, width, height, outputPath) {
  const resvg = new Resvg(sourceBuffer, {
    fitTo: {
      mode: 'width',
      value: width,
    },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  fs.writeFileSync(outputPath, pngBuffer);
  console.log(`Generated ${outputPath} (${width}x${height})`);
}

generatePng(svgBuffer, 192, 192, path.resolve('public/pwa-192x192.png'));
generatePng(svgBuffer, 512, 512, path.resolve('public/pwa-512x512.png'));
generatePng(svgBuffer, 180, 180, path.resolve('public/apple-touch-icon.png'));
generatePng(maskableSvgBuffer, 512, 512, path.resolve('public/pwa-maskable-512x512.png'));
