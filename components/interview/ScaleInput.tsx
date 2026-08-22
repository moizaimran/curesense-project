import Slider from '@react-native-community/slider';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

const COLORS = [
  '#22C55E', // 1
  '#4ADE80', // 2
  '#86EFAC', // 3
  '#BEF264', // 4
  '#FDE047', // 5
  '#FACC15', // 6
  '#FB923C', // 7
  '#F97316', // 8
  '#EF4444', // 9
  '#DC2626', // 10
];

const LABELS: Record<number, string> = {
  1:  'Very mild',
  2:  'Mild',
  3:  'Mild–moderate',
  4:  'Moderate',
  5:  'Noticeable',
  6:  'Moderate–severe',
  7:  'Severe',
  8:  'Very severe',
  9:  'Extreme',
  10: 'Worst possible',
};

export default function ScaleInput({ onSubmit, disabled }: Props) {
  const [value, setValue]     = useState(5);
  const scaleAnim             = useRef(new Animated.Value(1)).current;
  const colorAnim             = useRef(new Animated.Value(4)).current; // index 4 = value 5

  const color = COLORS[value - 1];

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1.18,
      useNativeDriver: true,
      tension: 160,
      friction: 6,
    }).start(() => {
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 160,
        friction: 6,
      }).start();
    });
  }, [value]);

  function handleChange(v: number) {
    const rounded = Math.round(v);
    setValue(rounded);
  }

  function handleSubmit() {
    onSubmit(`${value} out of 10`);
  }

  return (
    <View style={s.wrap}>
      {/* Big animated value badge */}
      <View style={s.badgeRow}>
        <Animated.View
          style={[s.badge, { backgroundColor: color + '30', borderColor: color }, { transform: [{ scale: scaleAnim }] }]}
        >
          <Text style={[s.badgeNum, { color }]}>{value}</Text>
          <Text style={[s.badgeOf, { color }]}>/10</Text>
        </Animated.View>
        <Text style={s.label}>{LABELS[value]}</Text>
      </View>

      {/* Tick marks */}
      <View style={s.tickRow}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <Text key={n} style={[s.tick, n === value && { color, fontWeight: '800' }]}>{n}</Text>
        ))}
      </View>

      {/* Slider */}
      <Slider
        testID="pain-slider"
        style={s.slider}
        minimumValue={1}
        maximumValue={10}
        step={1}
        value={value}
        onValueChange={handleChange}
        minimumTrackTintColor={color}
        maximumTrackTintColor="rgba(255,255,255,0.15)"
        thumbTintColor={color}
        disabled={disabled}
      />

      {/* Submit */}
      <TouchableOpacity
        style={[s.sendBtn, { backgroundColor: color }, disabled && s.sendBtnOff]}
        onPress={handleSubmit}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <Text style={s.sendBtnText}>Submit — {value}/10</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 12, paddingHorizontal: 4 },

  badgeRow: { alignItems: 'center', gap: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
    gap: 2,
  },
  badgeNum: { fontSize: 42, fontWeight: '900', lineHeight: 48 },
  badgeOf:  { fontSize: 18, fontWeight: '600', paddingBottom: 4 },
  label:    { color: 'rgba(255,255,255,0.60)', fontSize: 13 },

  tickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  tick: { color: 'rgba(255,255,255,0.30)', fontSize: 11, width: 20, textAlign: 'center' },

  slider: { width: '100%', height: 44 },

  sendBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  sendBtnOff:  { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
