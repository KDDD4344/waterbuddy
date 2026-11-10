/**
 * Optional production models (Phase 7). content/art/models.json lists them; until an
 * artist's file is there and passes the contract check, the procedural Pip is used.
 */
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import models from '../../../../content/art/models.json';
import { buildPip, type PipRig } from './pip';
import { adaptPipModel, checkPipModel, type PipModel } from './pipModel';

const PIP_URL = (models as { pip: string | null }).pip;
let pending: Promise<PipModel | null> | null = null;

/** True when there is a model file to wait for. */
export const hasPipModel = !!PIP_URL;

/** Loads Pip's model once. Resolves to null (use the procedural Pip) on any problem. */
export function loadPipModel(url = PIP_URL, timeoutMs = 8000): Promise<PipModel | null> {
  if (!url) return Promise.resolve(null);
  if (pending && url === PIP_URL) return pending;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const load = loader.loadAsync(url).then((gltf) => {
    const model = { scene: gltf.scene, animations: gltf.animations };
    const problems = checkPipModel(model);
    if (problems.length) {
      console.warn(`Pip model ignored: ${problems.join('; ')}`);
      return null;
    }
    return model;
  });
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs));
  const p = Promise.race([load, timeout]).catch((err: unknown) => {
    console.warn('Pip model failed to load; using the built-in Pip.', err);
    return null;
  });
  if (url === PIP_URL) pending = p;
  return p;
}

export function makePip(model: PipModel | null, fill: number): PipRig {
  return model ? adaptPipModel(model, { fill }) : buildPip({ fill });
}

/** The model, null for the procedural Pip, or undefined while a model file is loading. */
export function usePipModel(): PipModel | null | undefined {
  const [model, setModel] = useState<PipModel | null | undefined>(hasPipModel ? undefined : null);
  useEffect(() => {
    if (!hasPipModel) return;
    let live = true;
    void loadPipModel().then((m) => live && setModel(m));
    return () => {
      live = false;
    };
  }, []);
  return model;
}

export type { PipModel };
export { THREE };
