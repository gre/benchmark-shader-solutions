/**
 * FPS / frame-time overlay (shell, identical in every RN app).
 * Stats over a sliding 2 s window, measured on two threads:
 *  - JS thread: requestAnimationFrame deltas
 *  - UI thread: Reanimated useFrameCallback deltas (pushed to JS every 500 ms)
 *  - rn-native only: the native render loop (SilkView onFrameStats, 1 s window)
 * Loops only run while the overlay is visible (no cost when hidden), or
 * always in stress mode with stats=1 (src/stress.ts), which then receives the
 * JS / UI stats for its [stats] log line.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  EMPTY,
  PUSH_MS,
  STRESS,
  jsFrameTick,
  pushTime,
  reportStats,
  statsOf,
  type Stats,
} from './stress';
import { subscribeNativeStats } from './nativeStats';

type Props = {
  visible: boolean;
  tech: string;
  animationThread: string;
  firstFrameMs: number | null;
};

export default function FpsOverlay({
  visible,
  tech,
  animationThread,
  firstFrameMs,
}: Props) {
  const [js, setJs] = useState<Stats>(EMPTY);
  const [ui, setUi] = useState<Stats>(EMPTY);
  // Native render loop stats (rn-native: <SilkView> onFrameStats, ~1 s window).
  const [nat, setNat] = useState<Stats>(EMPTY);
  useEffect(
    () =>
      subscribeNativeStats(s =>
        setNat({ fps: s.fps, avg: s.avgMs, p95: s.p95Ms, n: 1 }),
      ),
    [],
  );

  // Measure while visible, or always when stress stats are on.
  const measure = visible || STRESS.stats;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const onUi = useRef((s: Stats) => {
    if (visibleRef.current) {
      setUi(s);
    }
    if (STRESS.stats) {
      reportStats('ui', s);
    }
  }).current;

  // JS thread: requestAnimationFrame.
  useEffect(() => {
    if (!measure) {
      return;
    }
    const times: number[] = [];
    let lastPush = 0;
    let raf = requestAnimationFrame(function loop(now) {
      pushTime(times, now);
      if (STRESS.stats) {
        jsFrameTick(now);
      }
      if (now - lastPush > PUSH_MS) {
        lastPush = now;
        const s = statsOf(times);
        if (visibleRef.current) {
          setJs(s);
        }
        if (STRESS.stats) {
          reportStats('js', s);
        }
      }
      raf = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(raf);
  }, [measure]);

  // UI thread: Reanimated frame callback.
  const uiTimes = useSharedValue<number[]>([]);
  const uiLastPush = useSharedValue(0);
  const frameCb = useFrameCallback(({ timestamp }) => {
    uiTimes.modify(times => {
      'worklet';
      pushTime(times, timestamp);
      return times;
    });
    if (timestamp - uiLastPush.value > PUSH_MS) {
      uiLastPush.value = timestamp;
      scheduleOnRN(onUi, statsOf(uiTimes.value));
    }
  }, false);

  useEffect(() => {
    if (measure) {
      uiTimes.value = [];
    }
    frameCb.setActive(measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure]);

  if (!visible) {
    return null;
  }
  return (
    <View style={styles.box} pointerEvents="none">
      <Text style={styles.title}>{tech}</Text>
      <Text style={styles.line}>{fmt('JS', js)}</Text>
      <Text style={styles.line}>{fmt('UI', ui)}</Text>
      <Text style={styles.line}>{fmt('NAT', nat)}</Text>
      <Text style={styles.small}>window 2 s · avg/p95 = frame time</Text>
      <Text style={styles.small}>NAT = native render loop (SilkView onFrameStats, 1 s)</Text>
      <Text style={styles.small}>animation: {animationThread}</Text>
      <Text style={styles.small}>
        first frame: {firstFrameMs == null ? '…' : `${firstFrameMs.toFixed(0)} ms`}{' '}
        after JS start
      </Text>
    </View>
  );
}

function fmt(label: string, s: Stats) {
  return `${label} ${s.fps.toFixed(1).padStart(5)} fps  avg ${s.avg
    .toFixed(2)
    .padStart(5)} ms  p95 ${s.p95.toFixed(2).padStart(5)} ms`;
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    top: 60,
    left: 12,
    right: 12,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  title: { color: '#fff', fontWeight: '600', marginBottom: 4 },
  line: { color: '#9f9', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 },
  small: { color: '#ccc', fontSize: 11, marginTop: 2 },
});
