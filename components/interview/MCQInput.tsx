import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface Props {
  options: string[];
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

export default function MCQInput({ options, onSubmit, disabled }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [custom,   setCustom]   = useState('');

  function handleSubmit() {
    const text = custom.trim() || selected;
    if (!text) return;
    onSubmit(text);
    setSelected(null);
    setCustom('');
  }

  const canSubmit = !!(custom.trim() || selected);

  return (
    <View style={s.wrap}>
      {/* Option chips — full-width rows */}
      <View style={s.chips}>
        {options.slice(0, 5).map((opt, idx) => {
          const active = selected === opt;
          return (
            <TouchableOpacity
              key={opt}
              style={[s.chip, active && s.chipActive]}
              onPress={() => setSelected(active ? null : opt)}
              disabled={disabled}
              activeOpacity={0.75}
            >
              <View style={s.chipInner}>
                <View style={[s.indexBadge, active && s.indexBadgeActive]}>
                  <Text style={[s.indexText, active && s.indexTextActive]}>
                    {String.fromCharCode(65 + idx)}
                  </Text>
                </View>
                <Text style={[s.chipText, active && s.chipTextActive]}>{opt}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Free-text override */}
      <TextInput
        style={s.input}
        value={custom}
        onChangeText={setCustom}
        placeholder="Or type your own answer…"
        placeholderTextColor="rgba(255,255,255,0.28)"
        multiline
        maxLength={400}
        editable={!disabled}
      />

      {/* Send */}
      <TouchableOpacity
        style={[s.sendBtn, (!canSubmit || disabled) && s.sendBtnOff]}
        onPress={handleSubmit}
        disabled={!canSubmit || disabled}
        activeOpacity={0.8}
      >
        <Text style={s.sendBtnText}>Send</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:  { gap: 10, paddingHorizontal: 4 },

  chips: { gap: 8 },

  chip: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  chipActive: {
    backgroundColor: 'rgba(37,99,235,0.20)',
    borderColor: '#2563EB',
  },

  chipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  indexBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  indexBadgeActive: {
    backgroundColor: '#2563EB',
  },
  indexText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '700',
  },
  indexTextActive: {
    color: '#fff',
  },

  chipText:       { color: 'rgba(255,255,255,0.70)', fontSize: 15, fontWeight: '500', flex: 1 },
  chipTextActive: { color: '#fff', fontWeight: '700' },

  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 14,
    minHeight: 52,
    maxHeight: 120,
  },

  sendBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  sendBtnOff:  { opacity: 0.35 },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.3 },
});
