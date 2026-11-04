"use client";

import { useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { api, ApiError } from "@/lib/api-client";

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded text-sm font-semibold hover:bg-black/5 ${
        active ? "bg-primary/10 text-primary" : "text-foreground/70"
      }`}
    >
      {children}
    </button>
  );
}

// Rich-text body editor for Full Description — stores/returns HTML.
// Image button uploads through the same /admin/uploads/image endpoint
// every other image field in the admin already uses, then embeds it
// inline; Link wraps the current selection with an <a>.
export function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose-sm max-w-none min-h-[160px] px-3 py-2 text-sm focus:outline-none",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  async function handleImageFile(file: File) {
    if (!editor) return;
    try {
      const { url } = await api.upload<{ url: string }>("/admin/uploads/image", file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to upload image");
    }
  }

  function handleLink() {
    if (!editor) return;
    const existing = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", existing ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  if (!editor) return null;

  return (
    <div className="rounded-lg border border-black/10 bg-white">
      <div className="flex items-center gap-1 border-b border-black/10 px-2 py-1.5">
        <ToolbarButton
          title="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          title="Heading"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          title="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          •≡
        </ToolbarButton>
        <ToolbarButton title="Image" onClick={() => fileInputRef.current?.click()}>
          🖼
        </ToolbarButton>
        <ToolbarButton title="Link" active={editor.isActive("link")} onClick={handleLink}>
          🔗
        </ToolbarButton>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) handleImageFile(file);
          }}
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
