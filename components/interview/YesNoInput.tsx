import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

export default function YesNoInput({ onSubmit, disabled }: Props) {
  return (
    <View style={s.row}>
      <TouchableOpacity
        style={[s.btn, s.yes, disabled && s.btnDisabled]}
        onPress={() => onSubmit('Yes')}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <Text style={s.btnText}>Yes</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.btn, s.no, disabled && s.btnDisabled]}
        onPress={() => onSubmit('No')}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <Text style={s.btnText}>No</Text>
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
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
