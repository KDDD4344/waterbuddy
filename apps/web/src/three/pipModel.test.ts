import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { adaptPipModel, checkPipModel, PIP_CONTRACT, type PipModel } from './pipModel';
import { TidepoolController } from './controller';

/** A tiny stand-in for the artist's file, following the naming contract. */
function contractScene(withClips = PIP_CONTRACT.clips): { scene: THREE.Scene; clips: THREE.AnimationClip[] } {
  const scene = new THREE.Scene();
  const mat = new THREE.MeshStandardMaterial({ color: 0xe9784f });
  const bottle = new THREE.Group();
  bottle.name = 'Bottle';
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.6, 16), mat);
  glass.name = 'Glass';
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 2.4, 16), mat);
  liquid.name = 'Liquid';
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.3, 8), mat);
  cork.name = 'Cork';
  cork.position.y = 1.4;
  const mouth = new THREE.Object3D();
  mouth.name = 'Mouth';
  mouth.position.y = 1.6;
  bottle.add(glass, liquid, cork, mouth);
  const pip = new THREE.Group();
  pip.name = 'Pip';
  pip.position.y = 1.8;
  pip.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), mat));
  for (const side of ['L', 'R']) {
    const eye = new THREE.Group();
    eye.name = `Eye_${side}`;
    eye.position.set(side === 'L' ? -0.15 : 0.15, 0.5, 0.1);
    eye.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat));
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    lid.name = `Lid_${side}`;
    eye.add(lid);
    pip.add(eye);
  }
  scene.add(bottle, pip);
  const clips = withClips.map((name) =>
    name === 'cork'
      ? new THREE.AnimationClip('cork', 0.8, [new THREE.VectorKeyframeTrack('Cork.position', [0, 0.8], [0, 2.2, 0, 0, 1.4, 0])])
      : name === 'hide'
        ? // ends in the hidden pose, as the art brief asks
          new THREE.AnimationClip('hide', 1, [new THREE.VectorKeyframeTrack('Pip.position', [0, 0.5, 1], [0, 1.8, 0, 0, 1.2, 0, 0, 1.0, 0])])
        : new THREE.AnimationClip(name, 1, [new THREE.VectorKeyframeTrack('Pip.position', [0, 0.5, 1], [0, 1.8, 0, 0, 2.0, 0, 0, 1.8, 0])])
  );
  return { scene, clips };
}

async function roundTrip(withClips?: string[]): Promise<PipModel> {
  const { scene, clips } = contractScene(withClips);
  const glb = (await new GLTFExporter().parseAsync(scene, { binary: true, animations: clips })) as ArrayBuffer;
  const gltf = await new GLTFLoader().parseAsync(glb, '');
  return { scene: gltf.scene, animations: gltf.animations };
}

describe('Pip from a glTF model', () => {
  it('accepts a model that follows the contract, after a real .glb round trip', async () => {
    const model = await roundTrip();
    expect(checkPipModel(model)).toEqual([]);
  });

  it('lists what is missing in plain words', async () => {
    const model = await roundTrip(['idle']);
    model.scene.getObjectByName('Mouth')!.name = 'Mouth.001';
    const problems = checkPipModel(model);
    expect(problems).toContain('missing node "Mouth"');
    expect(problems).toContain('missing clip "cork"');
  });

  it('drives the model like the built-in Pip: fill, cork, hide, eyes', async () => {
    const model = await roundTrip();
    const rig = adaptPipModel(model, { fill: 0.2 });
    const step = (s: number) => {
      for (let t = 0; t < s; t += 1 / 30) rig.update(1 / 30, t);
    };
    step(0.5);
    const low = rig.surfaceY;
    rig.setFill(0.9);
    step(2);
    expect(rig.surfaceY).toBeGreaterThan(low);

    const cork = rig.root.getObjectByName('Cork')!;
    rig.setCorked(false, true);
    const out = cork.position.y;
    rig.setCorked(true);
    step(1.2);
    expect(rig.corked).toBe(true);
    expect(cork.position.y).toBeLessThan(out);

    const pip = rig.root.getObjectByName('Pip')!;
    rig.setHidden(true);
    step(1.2);
    expect(pip.position.y).toBeLessThan(1.5); // held at the end of the hide clip
    rig.setHidden(false);
    step(1);

    const eye = rig.root.getObjectByName('Eye_L')!;
    const before = eye.quaternion.clone();
    rig.lookAt(new THREE.Vector3(5, 3, 5));
    step(0.2);
    expect(eye.quaternion.angleTo(before)).toBeGreaterThan(0.05);
    expect(rig.mouthWorld().y).toBeGreaterThan(0);
    rig.dispose();
  });

  it('plugs into the tidepool controller in place of the built-in Pip', async () => {
    const model = await roundTrip();
    const rig = adaptPipModel(model, { fill: 0.5 });
    const c = new TidepoolController({ fill: 0.5, pip: rig });
    const cam = new THREE.PerspectiveCamera();
    c.pour({ ml: 250, fromFill: 0.5, toFill: 0.625, milestone: null, overGoal: false });
    for (let t = 0; t < 5; t += 1 / 30) c.update(1 / 30, t, cam);
    expect(c.pouring).toBe(false);
    expect(rig.fill).toBeCloseTo(0.625, 2);
    c.dispose();
  });
});
