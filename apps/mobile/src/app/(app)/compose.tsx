import { CoreBridge, RichText, useBridgeState, useEditorBridge } from "@10play/tentap-editor";
import type { Post } from "@omicron/contract";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams, usePreventRemove } from "expo-router";
import { useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { KeyboardAvoidingView, useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEditorCss } from "@/components/composer/editor-css";
import { PublishSheet } from "@/components/composer/publish-sheet";
import { SettingsSheet } from "@/components/composer/settings-sheet";
import { ComposerToolbar } from "@/components/composer/toolbar";
import { useComposer } from "@/components/composer/use-composer";
import { useApi, useInstance } from "@/components/instance-provider";
import { Screen } from "@/components/layout/screen";
import { Button, IconButton } from "@/components/ui/button";
import { Field, inputClass, SheetInput } from "@/components/ui/input";
import { Sheet, useSheet } from "@/components/ui/sheet";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { useThemeColor } from "@/hooks/use-theme-colors";
import { confirm } from "@/lib/dialogs/confirm";
import { toast } from "@/lib/dialogs/toast";
import { commandsOf, isOmicronState } from "@/lib/editor/editor-commands";
import { editorHtml } from "@/lib/editor/editor-html";
import { OmicronBridge } from "@/lib/editor/omicron-bridge";
import { errorMessage } from "@/lib/errors";
import { postPath } from "@/lib/links";
import { pickImage, prepareImage } from "@/lib/media/upload";
import { goBack } from "@/lib/navigation";
import { queryKeys } from "@/lib/query/keys";

/** Tiptap JSON stored with the post, when it has any (webhook and remote posts are HTML only). */
const isDocument = (value: unknown): value is object => typeof value === "object" && value !== null;

function finishedMessage(status: "published" | "scheduled" | "draft", published: boolean) {
  if (status === "published") return published ? "Changes published" : "Published";
  return status === "scheduled" ? "Scheduled" : "Saved to drafts";
}

function SaveStatus({ state, published }: { state: string; published: boolean }) {
  const label = published
    ? ""
    : state === "saving"
      ? "Saving…"
      : state === "saved"
        ? "Saved"
        : state === "error"
          ? "Not saved"
          : "";
  return (
    <Text size="xs" tone={state === "error" ? "destructive" : "muted"} className="flex-1 px-1">
      {label}
    </Text>
  );
}

/** The editor page with the theme's background from its first paint, before the bridge's CSS arrives. */
const editorPage = (background: string) =>
  editorHtml.replace("<head>", `<head><style>html,body{background:${background}}</style>`);

/** Fills the navigation bar's height below the toolbar, and gives it up as the keyboard rises over it. */
function BottomInset() {
  const insets = useSafeAreaInsets();
  const { progress } = useReanimatedKeyboardAnimation();
  const style = useAnimatedStyle(() => ({ height: insets.bottom * (1 - progress.get()) }));
  return <Animated.View style={style} className="bg-background" />;
}

function Composer({ post }: { post: Post | undefined }) {
  const api = useApi();
  const { origin } = useInstance();
  const css = useEditorCss();
  const background = useThemeColor("--color-background");
  // Fixed for the session: a new source would reload the editor and lose what's written.
  const [source] = useState(() => editorPage(background));
  const settings = useSheet();
  const publish = useSheet();
  const linkSheet = useSheet();
  const [linkDraft, setLinkDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const editor = useEditorBridge({
    customSource: source,
    // Keeps TenTap's own WebView styles alongside ours below.
    mergeStyles: true,
    bridgeExtensions: [CoreBridge.configureCSS(css), OmicronBridge],
    initialContent: isDocument(post?.contentJson) ? post.contentJson : (post?.contentHtml ?? ""),
    // Root-relative image URLs in the body resolve against the instance.
    webviewBaseURL: `${origin}/`,
    onChange: () => composer.changed(),
  });
  const bridgeState = useBridgeState(editor);
  const editorState = isOmicronState(bridgeState) ? bridgeState : undefined;

  const run = commandsOf(editor);
  const composer = useComposer(post, async () => ({ html: await editor.getHTML(), json: await editor.getJSON() }));
  const { fields, update, published } = composer;
  const scheduledAt = post?.status === "scheduled" ? (post.publishAt ?? null) : null;

  // Ask before throwing away unsaved work; for a draft, try saving it first.
  const leaving = useRef(false);
  usePreventRemove(composer.unsaved, ({ repeat }) => {
    if (leaving.current) return repeat();
    void (async () => {
      const flushed = await composer.flush().then(
        () => true,
        () => false,
      );
      if (!published && flushed) return repeat();
      const discard = await confirm({
        title: published ? "Discard your changes?" : "Leave without saving?",
        description: "Your latest changes haven't been saved.",
        confirmText: "Discard",
        cancelText: "Keep editing",
        destructive: true,
      });
      if (discard) repeat();
    })();
  });

  const finish = async (status: "published" | "scheduled" | "draft", at: Date | null = null) => {
    setBusy(true);
    // Computed before the try: the React Compiler can't optimise one holding conditional expressions.
    const when = at ? at.toISOString() : null;
    const done = finishedMessage(status, published);
    try {
      const id = await composer.persist(status, when);
      leaving.current = true;
      publish.dismiss();
      toast(done);
      if (status === "published") {
        const { post: saved } = await api.post(id);
        router.replace(postPath(saved));
      } else {
        router.replace({ pathname: "/posts/manage", params: { tab: status } });
      }
    } catch (error) {
      toast(errorMessage(error), "error");
    }
    setBusy(false);
  };

  const insertImage = async () => {
    const uri = await pickImage();
    if (!uri) return;
    try {
      toast("Uploading image…");
      const image = await prepareImage(uri);
      const { url } = await api.uploadImage(image.bytes, image.contentType);
      run({ name: "image", src: url, alt: "" });
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  return (
    <Screen>
      <View className="h-14 flex-row items-center gap-1 px-2">
        <IconButton icon="x" label="Close" onPress={goBack} iconClassName="text-foreground" />
        <SaveStatus state={composer.save.state} published={published} />
        <IconButton icon="settings-2" label="Story settings" onPress={settings.present} />
        <Button
          variant="solid"
          size="sm"
          loading={busy}
          onPress={() => (published ? void finish("published") : publish.present())}
        >
          {published ? "Update" : "Publish"}
        </Button>
      </View>

      {/* The editor shrinks above the keyboard rather than sitting behind it, so its caret never needs padding. */}
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <TextInput
          value={fields.title}
          onChangeText={(title) => update("title", title)}
          placeholder="Title"
          multiline
          maxLength={200}
          placeholderTextColorClassName="accent-muted-foreground"
          className="px-5 pt-2 pb-1 font-content-bold text-3xl text-foreground"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={() => editor.focus("start")}
        />
        <View className="flex-1">
          {/* TenTap's default paints the WebView white before the page loads and while it closes. */}
          <RichText editor={editor} style={{ backgroundColor: background }} />
        </View>

        <ComposerToolbar
          state={editorState}
          run={run}
          onImage={() => void insertImage()}
          onLink={() => {
            setLinkDraft(editorState?.activeLink ?? "");
            // The editor's keyboard would cover the sheet; the address field brings up its own.
            editor.blur();
            linkSheet.present();
          }}
        />
        <BottomInset />
      </KeyboardAvoidingView>

      <SettingsSheet sheetRef={settings.ref} fields={fields} update={update} />
      <PublishSheet
        sheetRef={publish.ref}
        scheduledAt={scheduledAt}
        busy={busy}
        onPublish={() => void finish("published")}
        onSchedule={(at) => void finish("scheduled", at)}
        onDraft={() => void finish("draft")}
      />
      <Sheet sheetRef={linkSheet.ref} title="Link">
        <View className="gap-3 px-5">
          <Field label="Address">
            <SheetInput
              value={linkDraft}
              onChangeText={setLinkDraft}
              placeholder="https://"
              autoCapitalize="none"
              autoFocus
              keyboardType="url"
              placeholderTextColorClassName="accent-muted-foreground"
              className={inputClass}
            />
          </Field>
          <View className="flex-row justify-end gap-2">
            {editorState?.active.link && (
              <Button
                variant="ghost"
                onPress={() => {
                  run({ name: "link", href: null });
                  linkSheet.dismiss();
                }}
              >
                Remove link
              </Button>
            )}
            <Button
              variant="solid"
              disabled={!linkDraft.trim()}
              onPress={() => {
                const href = /^[a-z][a-z\d+.-]*:/i.test(linkDraft.trim())
                  ? linkDraft.trim()
                  : `https://${linkDraft.trim()}`;
                run({ name: "link", href });
                linkSheet.dismiss();
              }}
            >
              Apply
            </Button>
          </View>
        </View>
      </Sheet>
    </Screen>
  );
}

/** New story (`/compose`), a draft or scheduled post (`?id=`), or a published post being edited. */
export default function Compose() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const api = useApi();
  const {
    data: post,
    error,
    refetch,
    isPending,
  } = useQuery({
    queryKey: queryKeys.postById(id ?? ""),
    queryFn: async () => (await api.post(id!)).post,
    enabled: Boolean(id),
    meta: { persist: false },
    staleTime: 0,
  });

  if (id && isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  if (id && error) {
    return (
      <Screen>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }
  return <Composer key={post?.id ?? "new"} post={post} />;
}
