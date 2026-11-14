/**
 * Makes public/models/buddy/ripple-waterbuddy.opt.glb from the supplied ripple-waterbuddy.glb,
 * which is never changed. Deliberately gentle: no quantization, pruning, dedup or joining, because
 * those rewrite node transforms and merge materials that Ripple's live layer drives by name.
 *  - geometry, skin, instancing and animation: EXT_meshopt_compression over the original floats
 *    (decodes bit for bit; triangles may start at a different corner, same winding),
 *  - the two base-colour textures: WebP at quality 90 (PSNR 40.6 and 44.2 dB).
 *
 * Run from apps/web (the libraries aren't project dependencies):
 *   npm i --no-save @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 \
 *     @gltf-transform/functions@4.5.1 meshoptimizer@0.22.0 sharp@0.34.4
 *   node scripts/compress-ripple.mjs public/models/buddy/ripple-waterbuddy.glb \
 *     public/models/buddy/ripple-waterbuddy.opt.glb
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
const [, , input, output, q = '90'] = process.argv;
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(input);
await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: Number(q) }));
doc
  .createExtension(EXTMeshoptCompression)
  .setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(output, doc);
