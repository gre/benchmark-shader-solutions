/**
 * @shader-bench components — React Native example.
 * Full-screen <Effect> of the picked tech package + a panel: tech picker,
 * shader picker, sliders generated from the shader's param schema (+ speed),
 * JS fps readout. "restart" remounts the Effect (clock back to t = 0; with
 * speed 0 that is the pixel-check frame). "hide" hides the panel (tap
 * anywhere to show it again).
 *
 * iOS launch arguments (NSUserDefaults argument domain, read through RN's
 * Settings module): -tech native -shader silk -ui 0 -<param> <value>
 *   e.g. xcrun simctl launch es-components com.effectstudy.components -ui 0 -speed 0
 */
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Settings, StatusBar, StyleSheet, Text, View } from 'react-native';
import Slider from './src/Slider';
import { TECHS, type TechName } from './src/techs';

const techNames = Object.keys(TECHS) as TechName[];
const launch = (k: string): unknown => (Platform.OS === 'ios' ? Settings.get(k) : undefined);

function launchParams(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of ['speed', 'amp', 'glow', 'hue']) {
    const v = launch(k);
    if (v !== undefined && v !== null && !isNaN(Number(v))) out[k] = Number(v);
  }
  return out;
}

function Fps() {
  const [fps, setFps] = useState('…');
  useEffect(() => {
    let raf = 0;
    let n = 0;
    let t0 = performance.now();
    const loop = () => {
      const now = performance.now();
      n++;
      if (now - t0 >= 500) {
        setFps(((n * 1000) / (now - t0)).toFixed(1));
        n = 0;
        t0 = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <Text style={styles.text}>{fps} fps (JS)</Text>;
}

function Chips<T extends string>({ items, value, onPick }: { items: readonly T[]; value: T; onPick: (v: T) => void }) {
  return (
    <View style={styles.chips}>
      {items.map(i => (
        <Pressable key={i} onPress={() => onPick(i)} style={[styles.chip, i === value && styles.chipOn]}>
          <Text style={styles.text}>{i}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function App() {
  const initialTech = String(launch('tech') ?? '') as TechName;
  const [tech, setTech] = useState<TechName>(techNames.includes(initialTech) ? initialTech : techNames[0]);
  const { Effect, schema } = TECHS[tech];
  const shaders = schema.shaderNames();
  const initialShader = String(launch('shader') ?? '');
  const [shader, setShader] = useState(shaders.includes(initialShader) ? initialShader : shaders[0]);
  const [params, setParams] = useState<Record<string, number>>(launchParams);
  const [ui, setUi] = useState(String(launch('ui') ?? '1') !== '0');
  const [mount, setMount] = useState(0); // 'restart' remounts the Effect: clock back to t = 0
  const specs = schema.getShaderSchema(shader).params;
  const values = Object.fromEntries(
    Object.entries(specs).map(([k, s]) => [k, Math.min(s.max, Math.max(s.min, params[k] ?? s.default))]),
  );

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <Effect key={`${tech}:${mount}`} shader={shader as never} params={params} style={StyleSheet.absoluteFill} />
      {ui ? (
        <View style={styles.panel}>
          <View style={styles.row}>
            <Text style={[styles.text, styles.bold]}>@shader-bench</Text>
            <Fps />
            <Pressable onPress={() => setUi(false)} style={styles.chip}>
              <Text style={styles.text}>hide</Text>
            </Pressable>
          </View>
          <Chips items={techNames} value={tech} onPick={setTech} />
          <Chips
            items={shaders}
            value={shader}
            onPick={s => {
              setShader(s);
              setParams({});
            }}
          />
          {Object.entries(specs).map(([name, s]) => (
            <View key={name} style={styles.row}>
              <Text style={[styles.text, styles.label]}>{name}</Text>
              <Slider
                value={values[name]}
                min={s.min}
                max={s.max}
                step={s.step}
                onChange={v => setParams(p => ({ ...p, [name]: v }))}
              />
              <Text style={[styles.text, styles.value]}>{values[name].toFixed(2)}</Text>
            </View>
          ))}
          <View style={styles.chips}>
            <Pressable onPress={() => setParams({})} style={styles.chip}>
              <Text style={styles.text}>reset</Text>
            </Pressable>
            <Pressable onPress={() => setMount(m => m + 1)} style={styles.chip}>
              <Text style={styles.text}>restart (t = 0)</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setUi(true)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  panel: {
    position: 'absolute', top: 60, left: 12, right: 12, padding: 12, gap: 8,
    borderRadius: 10, backgroundColor: 'rgba(10,10,20,0.82)',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.12)', alignSelf: 'flex-start' },
  chipOn: { backgroundColor: '#5562c9' },
  text: { color: '#eee', fontSize: 13 },
  bold: { fontWeight: '700' },
  label: { width: 48 },
  value: { width: 40, textAlign: 'right' },
});
