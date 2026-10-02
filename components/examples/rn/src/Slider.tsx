// Minimal slider (no dependency): a track + thumb driven by the responder
// system. Reports values on drag; `step` rounds them.
import React, { useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';

type Props = {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
};

export default function Slider({ value, min, max, step = 0.01, onChange }: Props) {
  const [width, setWidth] = useState(1);
  const startX = useRef(0);
  const toValue = (x: number) => {
    const r = Math.min(1, Math.max(0, x / width));
    const v = min + r * (max - min);
    return Math.round(v / step) * step;
  };
  const handle = (e: GestureResponderEvent) => onChange(toValue(e.nativeEvent.locationX));
  const ratio = (Math.min(max, Math.max(min, value)) - min) / (max - min || 1);
  return (
    <View
      style={styles.hit}
      onLayout={e => setWidth(e.nativeEvent.layout.width || 1)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={e => {
        startX.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
        handle(e);
      }}
      onResponderMove={e => onChange(toValue(e.nativeEvent.pageX - startX.current))}>
      <View pointerEvents="none" style={styles.track}>
        <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
      </View>
      <View pointerEvents="none" style={[styles.thumb, { left: ratio * width - 9 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 30, justifyContent: 'center', flex: 1 },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  fill: { height: 4, backgroundColor: '#8fa0ff' },
  thumb: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', top: 6 },
});
