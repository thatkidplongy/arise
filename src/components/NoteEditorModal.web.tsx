import { Ionicons } from "@expo/vector-icons";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useEffect } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { accent, onAccent, surface, text, withAlpha } from "@/theme";

// Web build only: a true WYSIWYG note editor. Bold/italic/lists render as
// styled text (not raw ** markers), and we serialise back to Markdown on save
// so storage and the read-side Markdown renderer stay unchanged. The native
// (.tsx) sibling remains the plain-text fallback.

const EDITOR_CLASS = "arise-note-editor";

/** ProseMirror renders real DOM, so its inner elements (strong/em/ul/li) can't be
 * reached by RN styles — inject a scoped stylesheet once, themed to match the app. */
const CSS = `
.${EDITOR_CLASS} {
  outline: none;
  border: 1px solid ${surface.hairline};
  border-radius: 10px;
  background: ${surface.base};
  color: ${text.primary};
  padding: 12px;
  font-size: 14px;
  line-height: 20px;
  min-height: 160px;
  max-height: 46vh;
  overflow-y: auto;
  font-family: inherit;
}
.${EDITOR_CLASS}:focus-within { border-color: ${accent}; }
.${EDITOR_CLASS} > * { margin: 0 0 8px; }
.${EDITOR_CLASS} > *:last-child { margin-bottom: 0; }
.${EDITOR_CLASS} strong { font-weight: 700; }
.${EDITOR_CLASS} em { font-style: italic; }
.${EDITOR_CLASS} s, .${EDITOR_CLASS} del { text-decoration: line-through; color: ${text.faint}; }
.${EDITOR_CLASS} h1 { font-size: 19px; line-height: 25px; font-weight: 700; }
.${EDITOR_CLASS} h2 { font-size: 16px; line-height: 22px; font-weight: 700; }
.${EDITOR_CLASS} h3 { font-size: 15px; line-height: 21px; font-weight: 700; }
.${EDITOR_CLASS} ul, .${EDITOR_CLASS} ol { padding-left: 20px; }
.${EDITOR_CLASS} li { margin: 2px 0; }
.${EDITOR_CLASS} li > p { margin: 0; }
.${EDITOR_CLASS} blockquote {
  border-left: 3px solid ${surface.hairline};
  padding-left: 10px;
  color: ${text.secondary};
  font-style: italic;
}
.${EDITOR_CLASS} code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  background: ${withAlpha(text.primary, 0.07)};
  padding: 1px 4px;
  border-radius: 4px;
}
.${EDITOR_CLASS} pre {
  background: ${withAlpha(text.primary, 0.06)};
  border: 1px solid ${surface.hairline};
  border-radius: 8px;
  padding: 10px 12px;
  overflow-x: auto;
}
.${EDITOR_CLASS} pre code { background: transparent; padding: 0; font-size: 12.5px; line-height: 18px; }
.${EDITOR_CLASS} p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: ${text.faint};
  float: left;
  height: 0;
  pointer-events: none;
}
`;

function useEditorStyles() {
  useEffect(() => {
    const id = `${EDITOR_CLASS}-styles`;
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);
}

/**
 * Normalise what the serialiser hands back into what we actually store.
 *
 * `getMarkdown()` aims at a markdown-to-HTML pipeline: it encodes HTML entities
 * (`->` becomes `-&gt;`) and backslash-escapes markdown punctuation. Both are wrong
 * here — notes are rendered by our own Markdown component, which prints text
 * literally, and the native editor stores exactly what was typed. Undoing both keeps
 * one storage format across platforms and stops entities surfacing in the app.
 */
function toStoredMarkdown(md: string): string {
  // A detached textarea decodes entities without parsing tags: its content is
  // RCDATA, so nothing in `md` can become an element.
  const decoder = document.createElement("textarea");
  decoder.innerHTML = md;
  return (decoder.value || "").replace(/\\([\\`*_[\]~])/g, "$1");
}

/** A compact toolbar button; `on` lights it when that mark/block is active. */
function Btn({ on, onPress, children }: { on?: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} style={[styles.tool, on && styles.toolOn]}>
      {children}
    </Pressable>
  );
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
  useEditorStyles();

  const editor = useEditor({
    extensions: [
      // Autolink off: these notes carry pasted code, and it reads `urls.map` or
      // `i.name` as a domain and rewrites it to [urls.map](http://urls.map). A link
      // you type yourself is still a link — only the guessing is off.
      StarterKit.configure({ link: { autolink: false } }),
      Markdown,
      Placeholder.configure({ placeholder: "Write it here…" }),
    ],
    content: initial,
    contentType: "markdown",
    editorProps: { attributes: { class: EDITOR_CLASS } },
  });

  // Reset to the note being edited (or blank) and focus each time it opens.
  useEffect(() => {
    if (!visible || !editor) return;
    editor.commands.setContent(initial, { contentType: "markdown" });
    editor.commands.focus("end");
  }, [visible, initial, editor]);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      strike: e?.isActive("strike") ?? false,
      heading: e?.isActive("heading", { level: 2 }) ?? false,
      bullet: e?.isActive("bulletList") ?? false,
      ordered: e?.isActive("orderedList") ?? false,
      quote: e?.isActive("blockquote") ?? false,
      code: e?.isActive("codeBlock") ?? false,
      empty: e?.isEmpty ?? true,
    }),
  });

  const save = () => {
    if (!editor || editor.isEmpty) return;
    const md = toStoredMarkdown(editor.getMarkdown()).trim();
    if (!md) return;
    onSave(md);
  };

  const disabled = state?.empty ?? true;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.head}>
            <Ionicons name="create-outline" size={16} color={accent} />
            <Text style={styles.prompt}>{prompt}</Text>
          </View>

          <View style={styles.toolbar}>
            <Btn
              on={state?.bold}
              onPress={() => editor?.chain().focus().toggleBold().run()}
            >
              <Text style={[styles.toolText, { fontWeight: "800" }]}>B</Text>
            </Btn>
            <Btn
              on={state?.italic}
              onPress={() => editor?.chain().focus().toggleItalic().run()}
            >
              <Text style={[styles.toolText, { fontStyle: "italic" }]}>I</Text>
            </Btn>
            <Btn
              on={state?.strike}
              onPress={() => editor?.chain().focus().toggleStrike().run()}
            >
              <Text
                style={[
                  styles.toolText,
                  { textDecorationLine: "line-through" },
                ]}
              >
                S
              </Text>
            </Btn>
            <Btn
              on={state?.heading}
              onPress={() =>
                editor?.chain().focus().toggleHeading({ level: 2 }).run()
              }
            >
              <Text style={[styles.toolText, { fontWeight: "800" }]}>H</Text>
            </Btn>
            <Btn
              on={state?.bullet}
              onPress={() => editor?.chain().focus().toggleBulletList().run()}
            >
              <Ionicons name="list-outline" size={17} color={text.secondary} />
            </Btn>
            <Btn
              on={state?.ordered}
              onPress={() => editor?.chain().focus().toggleOrderedList().run()}
            >
              <Text style={styles.toolText}>1.</Text>
            </Btn>
            <Btn
              on={state?.quote}
              onPress={() => editor?.chain().focus().toggleBlockquote().run()}
            >
              <Text style={[styles.toolText, { fontSize: 17 }]}>❝</Text>
            </Btn>
            <Btn
              on={state?.code}
              onPress={() => editor?.chain().focus().toggleCodeBlock().run()}
            >
              <Ionicons name="code-slash" size={16} color={text.secondary} />
            </Btn>
          </View>

          <EditorContent editor={editor} />

          <Text style={styles.hint}>
            Select text to format · headings, lists and quotes structure it.
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
              disabled={disabled}
              style={({ pressed }) => [
                styles.btn,
                styles.btnSave,
                pressed && { opacity: 0.85 },
                disabled && styles.btnDisabled,
              ]}
            >
              <Text style={styles.btnSaveText}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(30, 22, 14, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "90%",
    backgroundColor: surface.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: surface.hairline,
    padding: 18,
  },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    marginBottom: 14,
  },
  prompt: {
    flex: 1,
    color: text.primary,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21,
  },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  tool: {
    minWidth: 40,
    height: 36,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    backgroundColor: surface.base,
  },
  toolOn: { backgroundColor: withAlpha(accent, 0.12), borderColor: accent },
  toolText: { color: text.secondary, fontSize: 14, fontWeight: "600" },
  hint: { color: text.faint, fontSize: 11, lineHeight: 16, marginTop: 8 },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 14,
  },
  btn: { borderRadius: 9, paddingVertical: 10, paddingHorizontal: 18 },
  btnGhost: { color: text.secondary, fontSize: 14, fontWeight: "600" },
  btnSave: { backgroundColor: accent },
  btnDisabled: { opacity: 0.5 },
  btnSaveText: { color: onAccent, fontSize: 14, fontWeight: "700" },
});
