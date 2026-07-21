import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { accent, onAccent, surface, text, withAlpha } from '@/theme';

type Sel = { start: number; end: number };

/** Wrap the current selection in `marker` (e.g. ** for bold). With no selection,
 * drop the markers in and place the cursor between them, ready to type. */
function wrapSelection(value: string, sel: Sel, marker: string): { value: string; sel: Sel } {
  const selected = value.slice(sel.start, sel.end);
  const next = value.slice(0, sel.start) + marker + selected + marker + value.slice(sel.end);
  return {
    value: next,
    sel: { start: sel.start + marker.length, end: sel.end + marker.length },
  };
}

/** Turn every line the selection touches into a "- " bullet (leaving ones that
 * already are). Cursor lands at the end of the affected block. */
function bulletLines(value: string, sel: Sel): { value: string; sel: Sel } {
  const start = value.lastIndexOf('\n', Math.max(0, sel.start - 1)) + 1;
  const lineEnd = value.indexOf('\n', sel.end);
  const end = lineEnd === -1 ? value.length : lineEnd;
  const block = value.slice(start, end);
  const prefixed = block
    .split('\n')
    .map((l) => (/^\s*[-*]\s+/.test(l) ? l : `- ${l}`))
    .join('\n');
  const next = value.slice(0, start) + prefixed + value.slice(end);
  const caret = start + prefixed.length;
  return { value: next, sel: { start: caret, end: caret } };
}

/** Wrap the selection in a ``` fenced code block on its own lines (empty block,
 * cursor inside, when there's no selection). */
function codeBlock(value: string, sel: Sel): { value: string; sel: Sel } {
  const selected = value.slice(sel.start, sel.end);
  const block = '```\n' + selected + '\n```';
  const next = value.slice(0, sel.start) + block + value.slice(sel.end);
  const caret = sel.start + 4; // just after the opening ```\n
  return { value: next, sel: { start: caret, end: caret + selected.length } };
}

export function NoteEditorModal({
  visible,
  prompt,
  initial,
  onSave,
  onClose,
}: {
  visible: boolean;
  prompt: string;
  initial: string;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [sel, setSel] = useState<Sel>({ start: initial.length, end: initial.length });

  // Reset the draft when a new edit session opens (modal shown, or a different
  // note passed in) — derived during render, so no setState-in-effect.
  const sessionKey = visible ? `open:${initial}` : 'closed';
  const [prevSession, setPrevSession] = useState(sessionKey);
  if (sessionKey !== prevSession) {
    setPrevSession(sessionKey);
    if (visible) {
      setValue(initial);
      setSel({ start: initial.length, end: initial.length });
    }
  }

  const apply = (fn: (v: string, s: Sel) => { value: string; sel: Sel }) => {
    const r = fn(value, sel);
    setValue(r.value);
    setSel(r.sel);
  };

  const save = () => {
    const t = value.trim();
    if (!t) return;
    onSave(t);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}
        >
          {/* Fixed layout: header + toolbar + actions stay put, only the input
              scrolls — so Save is always visible without scrolling the card. */}
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.head}>
              <Ionicons name="create-outline" size={16} color={accent} />
              <Text style={styles.prompt}>{prompt}</Text>
            </View>

            <View style={styles.toolbar}>
              <Pressable
                onPress={() => apply((v, s) => wrapSelection(v, s, '**'))}
                style={({ pressed }) => [styles.tool, pressed && styles.toolOn]}
              >
                <Text style={[styles.toolText, { fontWeight: '800' }]}>B</Text>
              </Pressable>
              <Pressable
                onPress={() => apply((v, s) => wrapSelection(v, s, '_'))}
                style={({ pressed }) => [styles.tool, pressed && styles.toolOn]}
              >
                <Text style={[styles.toolText, { fontStyle: 'italic' }]}>I</Text>
              </Pressable>
              <Pressable
                onPress={() => apply(bulletLines)}
                style={({ pressed }) => [styles.tool, styles.toolWide, pressed && styles.toolOn]}
              >
                <Ionicons name="list-outline" size={16} color={text.secondary} />
                <Text style={styles.toolText}>List</Text>
              </Pressable>
              <Pressable
                onPress={() => apply(codeBlock)}
                style={({ pressed }) => [styles.tool, pressed && styles.toolOn]}
              >
                <Ionicons name="code-slash" size={16} color={text.secondary} />
              </Pressable>
            </View>

            <TextInput
              value={value}
              onChangeText={setValue}
              selection={sel}
              onSelectionChange={(e) => setSel(e.nativeEvent.selection)}
              style={styles.input}
              placeholder="Write it here… select text, then tap B or I."
              placeholderTextColor={text.faint}
              multiline
              autoFocus
              scrollEnabled
              textAlignVertical="top"
              maxLength={2000}
            />
            <Text style={styles.hint}>
              Use <Text style={styles.b}>**bold**</Text>, <Text style={styles.i}>_italic_</Text>,{' '}
              <Text style={styles.mono}>`code`</Text>, <Text style={styles.mono}>```</Text> for code
              blocks, and <Text style={styles.mono}>-</Text> for lists.
            </Text>

            <View style={styles.actions}>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.btnGhost}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={save}
                disabled={!value.trim()}
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnSave,
                  pressed && { opacity: 0.85 },
                  !value.trim() && styles.btnDisabled,
                ]}
              >
                <Text style={styles.btnSaveText}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(30, 22, 14, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  // flex:1 gives the card a definite height to size its scrollable input against;
  // alignSelf keeps it centered within the overlay.
  kav: { flex: 1, width: '100%', maxWidth: 460, alignSelf: 'center', justifyContent: 'center' },
  card: {
    width: '100%',
    maxHeight: '90%',
    minHeight: 400,
    backgroundColor: surface.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: surface.hairline,
    padding: 18,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginBottom: 14 },
  prompt: { flex: 1, color: text.primary, fontSize: 15, fontWeight: '700', lineHeight: 21 },
  toolbar: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  tool: {
    minWidth: 40,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    backgroundColor: surface.base,
  },
  toolWide: { paddingHorizontal: 12 },
  toolOn: { backgroundColor: withAlpha(accent, 0.12), borderColor: accent },
  toolText: { color: text.secondary, fontSize: 14, fontWeight: '600' },
  // flex:1 → the input fills the space between the fixed toolbar and actions, and
  // scrolls inside itself when the text is long. It's the only scrollable region.
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 10,
    color: text.primary,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 120,
    backgroundColor: surface.base,
  },
  hint: { color: text.faint, fontSize: 11, lineHeight: 16, marginTop: 8 },
  b: { fontWeight: '700', color: text.secondary },
  i: { fontStyle: 'italic', color: text.secondary },
  mono: { color: text.secondary, fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
  btn: { borderRadius: 9, paddingVertical: 10, paddingHorizontal: 18 },
  btnGhost: { color: text.secondary, fontSize: 14, fontWeight: '600' },
  btnSave: { backgroundColor: accent },
  btnDisabled: { opacity: 0.5 },
  btnSaveText: { color: onAccent, fontSize: 14, fontWeight: '700' },
});
