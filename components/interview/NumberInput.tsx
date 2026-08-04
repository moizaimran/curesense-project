import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface Props {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

export default function NumberInput({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState('');

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  }

  return (
    <View style={s.row}>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={t => setValue(t.replace(/[^0-9.]/g, ''))}
        placeholder="Enter a number"
        placeholderTextColor="rgba(255,255,255,0.28)"
        keyboardType="decimal-pad"
        returnKeyType="send"
        onSubmitEditing={handleSubmit}
        editable={!disabled}
      />
      <TouchableOpacity
        style={[s.sendBtn, (!value.trim() || disabled) && s.sendBtnOff]}
        onPress={handleSubmit}
        disabled={!value.trim() || disabled}
        activeOpacity={0.8}
      >
        <Text style={s.sendIcon}>➤</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 4, alignItems: 'center' },

  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },

  sendBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnOff: { opacity: 0.35 },
  sendIcon:   { color: '#fff', fontSize: 16, marginLeft: 2 },
});
