import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  onSubmit: (text: string) => void;
  options?: string[];
  disabled?: boolean;
}

export default function YesNoInput({ onSubmit, options, disabled }: Props) {
  const labelA = options?.[0] ?? 'Yes';
  const labelB = options?.[1] ?? 'No';

  const isLiteralYesNo =
    labelA.toLowerCase() === 'yes' && labelB.toLowerCase() === 'no';

  return (
    <View style={s.row}>
      <TouchableOpacity
        style={[s.btn, isLiteralYesNo ? s.yes : s.optA, disabled && s.btnDisabled]}
        onPress={() => onSubmit(labelA)}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <Text style={s.btnText}>{labelA}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.btn, isLiteralYesNo ? s.no : s.optB, disabled && s.btnDisabled]}
        onPress={() => onSubmit(labelB)}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <Text style={s.btnText}>{labelB}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 4,
  },
  btn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  yes: {
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderColor: 'rgba(34,197,94,0.40)',
  },
  no: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: 'rgba(239,68,68,0.35)',
  },
  optA: {
    backgroundColor: 'rgba(37,99,235,0.15)',
    borderColor: 'rgba(96,165,250,0.40)',
  },
  optB: {
    backgroundColor: 'rgba(37,99,235,0.08)',
    borderColor: 'rgba(96,165,250,0.25)',
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
