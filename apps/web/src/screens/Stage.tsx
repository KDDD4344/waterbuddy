import { lazy, Suspense, useEffect, useState } from 'react';
import { PipInBottle } from '../components/PipInBottle';
import { canUseWebGL } from '../three/webgl';

const TidepoolCanvas = lazy(() => import('../three/TidepoolCanvas'));

type Props = {
  fill: number;
  corked: boolean;
  night: number;
  label: string;
  want3d: boolean;
  reducedMotion: boolean;
  soundOn: boolean;
};

/**
 * Pip's stage on Today. The flat drawing renders instantly and stays as the fallback;
 * the 3D tidepool loads afterwards and fades in once its first frame is drawn
 * (decision D-003: the tracker never waits for 3D).
 */
export function Stage({ fill, corked, night, label, want3d, reducedMotion, soundOn }: Props) {
  const use3d = want3d && canUseWebGL();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!use3d) setReady(false);
  }, [use3d]);

  return (
    <div className="stage-art" role="img" aria-label={label}>
      <div className={`stage-flat${ready ? ' hidden-under' : ''}`} aria-hidden="true">
        <PipInBottle className="stage-flat-art" fill={fill} corked={corked} transparent />
      </div>
      {use3d && (
        <Suspense fallback={null}>
          <div className={`stage-3d${ready ? ' ready' : ''}`}>
            <TidepoolCanvas fill={fill} corked={corked} night={night} reducedMotion={reducedMotion} soundOn={soundOn} onReady={() => setReady(true)} />
          </div>
        </Suspense>
      )}
    </div>
  );
}
