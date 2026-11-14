import * as THREE from 'three';
import type { Pose } from '../animator';

/**
 * The common skeleton: root (placed in the world) → mover (hop, lean, spin, turn toward
 * what Buddy looks at; pivots at the ground) → body (squash and stretch, volume kept).
 */
export class Rig {
  readonly mover = new THREE.Group();
  readonly body = new THREE.Group();
  private yaw = 0;
  private tmp = new THREE.Vector3();

  constructor(readonly root: THREE.Group) {
    root.add(this.mover);
    this.mover.add(this.body);
  }

  apply(p: Pose, look: THREE.Vector3, dt: number, turn = 0.55, squashAmount = 1) {
    this.tmp.copy(look);
    this.root.worldToLocal(this.tmp);
    const want = THREE.MathUtils.clamp(Math.atan2(this.tmp.x, this.tmp.z), -0.8, 0.8) * turn;
    this.yaw += (want - this.yaw) * (1 - Math.exp(-dt * 3.5));
    this.mover.position.y = p.hop;
    this.mover.rotation.set(p.leanZ, this.yaw + p.spin, -p.leanX, 'YXZ');
    const sy = 1 + p.squash * squashAmount;
    const sxz = 1 / Math.sqrt(Math.max(0.3, sy));
    this.body.scale.set(sxz, sy, sxz);
  }
}

export function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}
