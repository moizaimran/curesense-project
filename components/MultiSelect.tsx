import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useState } from 'react';

interface Props {
  label:       string;
  options:     string[];
  selected:    string[];
  onChange:    (v: string[]) => void;
  placeholder?: string;
}

export function MultiSelect({ label, options, selected, onChange, placeholder }: Props) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  function toggle(item: string) {
    onChange(selected.includes(item) ? selected.filter(s => s !== item) : [...selected, item]);
  }

  function remove(item: string) {
    onChange(selected.filter(s => s !== item));
  }

  return (
    <View style={s.wrap}>
      <Text style={s.label}>{label}</Text>

      {/* Trigger — chips live inside the box */}
      <TouchableOpacity style={s.trigger} onPress={() => setOpen(true)} activeOpacity={0.8}>
        <View style={s.triggerInner}>
          {selected.length === 0 ? (
            <Text style={s.triggerPlaceholder}>{placeholder ?? 'Select…'}</Text>
          ) : (
            <View style={s.chips}>
              {selected.map(item => (
                <View key={item} style={s.chip}>
                  <Text style={s.chipText} numberOfLines={1}>{item}</Text>
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation?.(); remove(item); }}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={s.chipX}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
        <Text style={s.chevron}>▾</Text>
      </TouchableOpacity>

      {/* Modal */}
      <Modal visible={open} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={s.sheet}>
            {/* Header */}
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>{label}</Text>
              <TouchableOpacity onPress={() => { setOpen(false); setSearch(''); }}>
                <Text style={s.sheetDone}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Search */}
            <TextInput
              style={s.search}
              placeholder="Search…"
              placeholderTextColor="#94A3B8"
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />

            {/* Options */}
            <ScrollView showsVerticalScrollIndicator={false}>
              {filtered.map(item => {
                const checked = selected.includes(item);
                return (
                  <TouchableOpacity key={item} style={s.option} onPress={() => toggle(item)} activeOpacity={0.7}>
                    <View style={[s.checkbox, checked && s.checkboxActive]}>
                      {checked && <Text style={s.checkMark}>✓</Text>}
                    </View>
                    <Text style={s.optionText}>{item}</Text>
                  </TouchableOpacity>
                );
              })}
              {filtered.length === 0 && (
                <Text style={s.noResults}>No results for "{search}"</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:    { marginBottom: 16 },
  label:   { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600', marginBottom: 8 },

  trigger:           { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 50 },
  triggerInner:      { flex: 1, marginRight: 8 },
  triggerPlaceholder:{ color: 'rgba(255,255,255,0.30)', fontSize: 15, paddingTop: 2 },
  chevron:           { color: 'rgba(255,255,255,0.40)', fontSize: 16, paddingTop: 2 },

  chips:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1D4ED8', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 10, gap: 5, maxWidth: 200 },
  chipText:{ color: '#FFFFFF', fontSize: 12, fontWeight: '600', flexShrink: 1 },
  chipX:   { color: 'rgba(255,255,255,0.80)', fontSize: 15, lineHeight: 17 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: '#0F172A', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%', paddingBottom: 32 },

  sheetHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  sheetTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  sheetDone:  { color: '#2563EB', fontSize: 16, fontWeight: '700' },

  search: { margin: 12, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, color: '#FFFFFF', fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },

  option:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', gap: 14 },
  checkbox:     { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.30)', alignItems: 'center', justifyContent: 'center' },
  checkboxActive:{ backgroundColor: '#2563EB', borderColor: '#2563EB' },
  checkMark:    { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  optionText:   { color: '#E2E8F0', fontSize: 15, flex: 1 },

  noResults: { color: '#64748B', fontSize: 14, textAlign: 'center', paddingVertical: 24 },
});
