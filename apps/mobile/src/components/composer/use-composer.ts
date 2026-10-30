import type { CoverCredit, OwnPostStatus, Post } from "@omicron/contract";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useApi } from "@/components/instance-provider";
import { ApiError } from "@/lib/api/client";
import { Autosave, type AutosaveSnapshot } from "@/lib/editor/autosave";
import { storage } from "@/lib/storage";

export type ComposerFields = {
  title: string;
  summary: string;
  tags: string[];
  language: string | null;
  aiAssisted: boolean;
  coverUrl: string | null;
  coverCredit: CoverCredit | null;
};

export type EditorContent = { html: string; json: unknown };

const LAST_LANGUAGE = "compose-lang";
const EMPTY_BODY = new Set(["", "<p></p>"]);

export function fieldsFrom(post: Post | undefined): ComposerFields {
  return {
    title: post?.title ?? "",
    summary: post?.summary ?? "",
    tags: post?.tags.map((tag) => tag.name) ?? [],
    // A new post starts in the language the author last published in.
    language: post ? (post.language ?? null) : (storage.getString(LAST_LANGUAGE) ?? null),
    aiAssisted: post?.aiAssisted ?? false,
    coverUrl: post?.coverUrl ?? null,
    coverCredit: post?.coverCredit ?? null,
  };
}

/** Whether a post body has anything in it (the editor's empty document is `<p></p>`). */
export const hasBody = (html: string) => !EMPTY_BODY.has(html.trim());

/** What the publish rules require; mirrors the web composer's checks (the server enforces the same). */
export function publishProblem(fields: ComposerFields, html: string): string | null {
  if (!fields.title.trim()) return "A blog post must have a title.";
  if (!hasBody(html)) return "Write something first.";
  return null;
}

type Api = ReturnType<typeof useApi>;

/**
 * What a composing session saves, kept outside React: autosave runs on timers, not renders, so it reads the
 * latest fields and post id from here rather than from state.
 */
class ComposerSession {
  fields: ComposerFields;
  postId: string | null;
  /** Set by the first author edit, so merely opening a post never saves it. */
  touched = false;
  readonly autosave: Autosave;

  constructor(
    private readonly api: Api,
    post: Post | undefined,
    private readonly readContent: () => Promise<EditorContent>,
    onSaveChange: (snapshot: AutosaveSnapshot) => void,
  ) {
    this.fields = fieldsFrom(post);
    this.postId = post?.id ?? null;
    this.autosave = new Autosave({
      onChange: onSaveChange,
      canSave: () => this.touched,
      save: () => this.saveDraft(),
    });
  }

  /** Records an author edit; returns the fields with `patch` applied. */
  edit(patch: Partial<ComposerFields> = {}): ComposerFields {
    this.touched = true;
    this.fields = { ...this.fields, ...patch };
    return this.fields;
  }

  body(content: EditorContent) {
    const f = this.fields;
    return {
      title: f.title.trim(),
      contentHtml: content.html,
      contentJson: content.json,
      aiAssisted: f.aiAssisted,
      language: f.language,
      // Null, not "", so the reader falls back to an excerpt.
      summary: f.summary.trim() || null,
      coverUrl: f.coverUrl,
      coverCredit: f.coverCredit,
      tags: f.tags,
    };
  }

  /** An autosave never sends a status, so a timer can't publish or unschedule anything. */
  private async saveDraft() {
    const content = await this.readContent();
    const f = this.fields;
    if (!f.title.trim() && !hasBody(content.html) && f.tags.length === 0 && !f.coverUrl) return;
    if (this.postId) await this.api.updatePost(this.postId, this.body(content));
    else this.postId = (await this.api.createPost({ ...this.body(content), status: "draft" })).post.id;
  }

  async persist(status: OwnPostStatus, publishAt: string | null): Promise<string> {
    const content = await this.readContent();
    if (status !== "draft") {
      const problem = publishProblem(this.fields, content.html);
      if (problem) throw new Error(problem);
    }
    // Hand over from autosave: no timer may fire, and a save in flight must land first.
    this.autosave.stop();
    await this.autosave.flush();
    const payload = {
      ...this.body(await this.readContent()),
      status,
      publishAt: status === "scheduled" ? publishAt : null,
    };
    if (this.postId) await this.api.updatePost(this.postId, payload);
    else this.postId = (await this.api.createPost(payload)).post.id;
    if (status === "published" && this.fields.language) storage.set(LAST_LANGUAGE, this.fields.language);
    this.touched = false;
    return this.postId;
  }
}

/**
 * The composer's state and saving. Unpublished posts autosave; a published post saves only when the author
 * says so.
 */
export function useComposer(post: Post | undefined, readContent: () => Promise<EditorContent>) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [save, setSave] = useState<AutosaveSnapshot>({ state: "idle", savedAt: null, error: null, dirty: false });
  const [session] = useState(() => new ComposerSession(api, post, readContent, setSave));
  const [fields, setFields] = useState(session.fields);
  const [edited, setEdited] = useState(false);
  const published = post?.status === "published";
  useEffect(() => () => session.autosave.stop(), [session]);

  /** Every author-visible change goes through here, so nothing escapes autosave. */
  const changed = (patch?: Partial<ComposerFields>) => {
    setFields(session.edit(patch));
    setEdited(true);
    if (!published) session.autosave.schedule();
  };

  const update = <K extends keyof ComposerFields>(key: K, value: ComposerFields[K]) => {
    changed({ [key]: value });
  };

  /** Creates or updates the post in `status`. Returns the post id, or throws with a message for the author. */
  const persist = async (status: OwnPostStatus, publishAt: string | null = null): Promise<string> => {
    try {
      const id = await session.persist(status, publishAt);
      setEdited(false);
      await queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "me" });
      return id;
    } catch (error) {
      if (!published) session.autosave.resume();
      throw error instanceof ApiError ? error : new Error(error instanceof Error ? error.message : "Failed to save.");
    }
  };

  return {
    fields,
    update,
    changed,
    persist,
    save,
    published,
    /** Unsaved work worth asking about before leaving. */
    unsaved: edited && (published || save.dirty),
    flush: () => session.autosave.flush(),
  };
}
