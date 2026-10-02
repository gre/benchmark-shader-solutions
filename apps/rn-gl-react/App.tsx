/**
 * Shell (identical in every RN app): full-screen Effect, hidden status bar,
 * tap anywhere to toggle the FPS overlay. Only src/Effect.tsx differs per tech.
 * Stress mode (src/stress.ts, runtime NSUserDefaults, off by default):
 * jsload busy loop, N stacked effect instances, [stats] log line.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, View } from 'react-native';
import Effect, { ANIMATION_THREAD, TECH } from './src/Effect';
import FpsOverlay from './src/FpsOverlay';
import { FPS_OVERLAY_AT_START } from './src/config';
import { STRESS, startStress } from './src/stress';

const jsStart = performance.now();

export default function App() {
  const [overlay, setOverlay] = useState(FPS_OVERLAY_AT_START);
  const [firstFrameMs, setFirstFrameMs] = useState<number | null>(null);
  const onFirstFrame = useCallback(() => {
    const ms = performance.now() - jsStart;
    setFirstFrameMs(prev => prev ?? ms);
    console.log(`[effect] first frame ${ms.toFixed(0)} ms after JS start`);
  }, []);
  useEffect(startStress, []);

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <Effect onFirstFrame={onFirstFrame} countFrames={STRESS.stats} />
      {extraInstances.map(i => (
        <View key={i} style={styles.instance} pointerEvents="none">
          <Effect />
        </View>
      ))}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => setOverlay(v => !v)}
      />
      <FpsOverlay
        visible={overlay}
        tech={TECH}
        animationThread={ANIMATION_THREAD}
        firstFrameMs={firstFrameMs}
      />
    </View>
  );
}

// Stress mode: instances 2..N, each its own <Effect/>, stacked at opacity 0.5.
const extraInstances = Array.from({ length: STRESS.instances - 1 }, (_, i) => i + 1);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  instance: { ...StyleSheet.absoluteFill, opacity: 0.5 },
});
