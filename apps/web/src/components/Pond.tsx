import { lazy, Suspense, useState, type ReactNode } from 'react';
import { canRunLive3d } from '../three/webgl';
import type { PondStageProps } from '../pond/PondStage';

const PondStage = lazy(() => import('../pond/PondStage'));

type Props = Omit<PondStageProps, 'className' | 'onReady' | 'onError'> & {
  /** Off in settings, or no WebGL: the still picture of the spring is shown instead. */
  want3d: boolean;
  variant: 'today' | 'atlas';
  children?: ReactNode;
};

/**
 * Ripple's spring. A still picture shows at once (and stays as the fallback when 3D is off,
 * unsupported or lost); the live scene loads behind it and fades in once Ripple has arrived.
 * Logging never waits for 3D (decision D-003).
 */
export function Pond({ want3d, variant, children, ...stage }: Props) {
  const use3d = want3d && canRunLive3d();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const live = use3d && !failed;
  return (
    <div className={`pond pond-${variant}`} data-live={(live && ready) || undefined}>
      <img className="pond-poster" src="/ripple-poster.webp" alt="" aria-hidden="true" decoding="async" />
      {live && (
        <Suspense fallback={null}>
          <PondStage
            {...stage}
            className="pond-canvas"
            onReady={() => setReady(true)}
            onError={() => setFailed(true)}
          />
        </Suspense>
      )}
      {use3d && !ready && !failed && (
        <p className="pond-arriving" role="status">
          Ripple is on the way…
        </p>
      )}
      {children}
    </div>
  );
}
