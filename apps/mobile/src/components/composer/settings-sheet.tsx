import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useState, type RefObject } from "react";
import { Pressable, View } from "react-native";
import { useApi, useInstance } from "@/components/instance-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Field, inputClass, SheetInput } from "@/components/ui/input";
import { PressableScale } from "@/components/ui/pressable";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { useDebounced } from "@/hooks/use-debounced";
import { toast } from "@/lib/dialogs/toast";
import { errorMessage } from "@/lib/errors";
import { LANGUAGES, languageLabel } from "@/lib/languages";
import { pickImage, prepareImage } from "@/lib/media/upload";
import { queryKeys } from "@/lib/query/keys";
import type { ComposerFields } from "./use-composer";

const MAX_TAGS = 5;
const MAX_SUMMARY = 300;

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const api = useApi();
  const [draft, setDraft] = useState("");
  const q = useDebounced(draft.trim(), 200);
  const suggestions = useQuery({
    queryKey: queryKeys.tagSuggestions(q),
    queryFn: async () => (await api.suggestTags(q)).tags,
    enabled: q.length > 0,
    meta: { persist: false },
  });
  const add = (name: string) => {
    const tag = name.trim().replace(/^#/, "");
    if (!tag || tags.length >= MAX_TAGS || tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    onChange([...tags, tag]);
    setDraft("");
  };

  return (
    <Field label="Tags" hint={`Up to ${MAX_TAGS}, so readers can find your story.`}>
      <View className="flex-row flex-wrap gap-2">
        {tags.map((tag) => (
          <PressableScale
            key={tag}
            accessibilityLabel={`Remove tag ${tag}`}
            onPress={() => onChange(tags.filter((t) => t !== tag))}
            className="flex-row items-center gap-1 rounded-full bg-muted px-3 py-1"
          >
            <Text size="sm" weight="medium" tone="alt">
              #{tag}
            </Text>
            <Icon name="x" size={12} className="text-muted-foreground" />
          </PressableScale>
        ))}
      </View>
      {tags.length < MAX_TAGS && (
        <SheetInput
          value={draft}
          onChangeText={(text) => (text.endsWith(",") ? add(text.slice(0, -1)) : setDraft(text))}
          onSubmitEditing={() => add(draft)}
          placeholder="Add a tag"
          autoCapitalize="none"
          returnKeyType="done"
          blurOnSubmit={false}
          placeholderTextColorClassName="accent-muted-foreground"
          className={inputClass}
        />
      )}
      {q.length > 0 && (suggestions.data?.length ?? 0) > 0 && (
        <View className="flex-row flex-wrap gap-2">
          {suggestions.data?.slice(0, 6).map((tag) => (
            <PressableScale
              key={tag.slug}
              onPress={() => add(tag.name)}
              className="rounded-full border border-border px-3 py-1"
            >
              <Text size="xs" tone="alt">
                #{tag.name} · {tag.postCount}
              </Text>
            </PressableScale>
          ))}
        </View>
      )}
    </Field>
  );
}

function LanguagePicker({ value, onChange }: { value: string | null; onChange: (code: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Field label="Language" hint="Lets readers filter their feeds by language.">
      <Pressable onPress={() => setOpen((v) => !v)} className={`${inputClass} flex-row items-center justify-between`}>
        <Text size="sm">{value ? languageLabel(value) : "Not set"}</Text>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={16} className="text-muted-foreground" />
      </Pressable>
      {open && (
        <Card className="max-h-72 p-1">
          {[{ code: "", name: "Not set", native: "" }, ...LANGUAGES].map((language) => (
            <Pressable
              key={language.code || "none"}
              onPress={() => {
                onChange(language.code || null);
                setOpen(false);
              }}
              className="flex-row items-center justify-between rounded-button px-3 py-2.5 active:bg-muted"
            >
              <Text size="sm">
                {language.name}
                {language.native && language.native !== language.name ? (
                  <Text size="sm" tone="muted">
                    {" "}
                    · {language.native}
                  </Text>
                ) : null}
              </Text>
              {(value ?? "") === language.code && <Icon name="check" size={16} />}
            </Pressable>
          ))}
        </Card>
      )}
    </Field>
  );
}

function CoverPicker({ url, onChange }: { url: string | null; onChange: (url: string | null) => void }) {
  const api = useApi();
  const { media } = useInstance();
  const [busy, setBusy] = useState(false);
  const upload = async () => {
    const uri = await pickImage();
    if (!uri) return;
    setBusy(true);
    try {
      const image = await prepareImage(uri);
      onChange((await api.uploadImage(image.bytes, image.contentType)).url);
    } catch (error) {
      toast(errorMessage(error), "error");
    }
    setBusy(false);
  };
  const preview = media(url);
  return (
    <Field label="Banner" hint="Shown on cards and at the top of the story. Without one, the first image is used.">
      {preview ? (
        <Image source={preview} contentFit="cover" style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 16 }} />
      ) : null}
      <View className="flex-row gap-2">
        <Button variant="outline" size="sm" icon="image-plus" loading={busy} onPress={() => void upload()}>
          {url ? "Replace" : "Upload"}
        </Button>
        {url && (
          <Button variant="ghost" size="sm" icon="trash-2" onPress={() => onChange(null)}>
            Remove
          </Button>
        )}
      </View>
    </Field>
  );
}

/** Everything about a story except its title and body: the web composer's side fields. */
export function SettingsSheet({
  sheetRef,
  fields,
  update,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
  fields: ComposerFields;
  update: <K extends keyof ComposerFields>(key: K, value: ComposerFields[K]) => void;
}) {
  return (
    <Sheet sheetRef={sheetRef} title="Story settings" scrollable>
      <View className="gap-6 px-5">
        <Field label="Summary" hint="Optional. Without one, cards show the opening lines.">
          <SheetInput
            value={fields.summary}
            onChangeText={(text) => update("summary", text.slice(0, MAX_SUMMARY))}
            placeholder="A sentence or two about the story"
            multiline
            textAlignVertical="top"
            placeholderTextColorClassName="accent-muted-foreground"
            className={`${inputClass} h-24 py-2.5`}
          />
        </Field>
        <TagEditor tags={fields.tags} onChange={(tags) => update("tags", tags)} />
        <LanguagePicker value={fields.language} onChange={(code) => update("language", code)} />
        <CoverPicker
          url={fields.coverUrl}
          onChange={(url) => {
            update("coverUrl", url);
            update("coverCredit", null);
          }}
        />
        <View className="flex-row items-center justify-between gap-4">
          <View className="flex-1">
            <Text size="sm" weight="medium">
              AI-assisted
            </Text>
            <Text size="xs" tone="muted">
              Tell readers AI helped write this story.
            </Text>
          </View>
          <Switch checked={fields.aiAssisted} onCheckedChange={(on) => update("aiAssisted", on)} label="AI-assisted" />
        </View>
      </View>
    </Sheet>
  );
}
