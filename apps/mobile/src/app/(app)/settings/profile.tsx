import type { ProfileLink } from "@omicron/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { FormError } from "@/components/auth/auth-shell";
import { useApi } from "@/components/instance-provider";
import { UserAvatar } from "@/components/post/post-bits";
import { LinkIcon } from "@/components/profile/link-icon";
import { HtmlContent } from "@/components/reader/html-content";
import { FormScreen } from "@/components/settings/form-screen";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { PillTabs } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { useRefreshOnFocus } from "@/hooks/use-refresh-on-focus";
import { useViewer } from "@/lib/auth/session";
import { toast } from "@/lib/dialogs/toast";
import { errorMessage } from "@/lib/errors";
import { mergeUnedited, sameValues } from "@/lib/form-sync";
import { pickImage, prepareImage } from "@/lib/media/upload";
import { goBack } from "@/lib/navigation";
import { identifierToUrl, PLATFORMS, platformMeta, urlToIdentifier } from "@/lib/profile-links";
import { queryKeys } from "@/lib/query/keys";

const MAX_NAME = 60;
const MAX_BIO = 500;
const MAX_SECTION = 20_000;
const MAX_TAGS = 5;
const AVATAR_SIZE = 512;

type LinkDraft = { id: string; platform: string; value: string; label: string };
type Viewer = NonNullable<ReturnType<typeof useViewer>["user"]>;

/** The form's fields as the server has them, to compare against what the person has typed. */
function serverValues(user: Viewer | null) {
  return {
    displayName: user?.displayName ?? "",
    bio: user?.bio ?? "",
    publicEmail: user?.publicEmail ?? "",
    tags: user?.tags.map((tag) => tag.name).join(", ") ?? "",
    section: user?.customSection ?? "",
    links:
      user?.links.map((link) => ({
        platform: link.platform,
        value: urlToIdentifier(link.platform, link.url),
        label: link.label,
      })) ?? [],
  };
}

const withIds = (links: Omit<LinkDraft, "id">[]): LinkDraft[] => links.map((link) => ({ id: linkId(), ...link }));
const withoutIds = (links: LinkDraft[]) => links.map(({ platform, value, label }) => ({ platform, value, label }));

let nextLinkId = 0;
const linkId = () => `link-${nextLinkId++}`;

function LinksEditor({ links, onChange }: { links: LinkDraft[]; onChange: (links: LinkDraft[]) => void }) {
  const [picking, setPicking] = useState(false);
  const set = (index: number, patch: Partial<LinkDraft>) =>
    onChange(links.map((link, i) => (i === index ? { ...link, ...patch } : link)));
  return (
    <Field label="Links" hint="Shown on your profile.">
      <View className="gap-3">
        {links.map((link, index) => {
          const meta = platformMeta(link.platform);
          return (
            <Card key={link.id} className="gap-2 p-3">
              <View className="flex-row items-center gap-2">
                <LinkIcon platform={link.platform} />
                <Text weight="medium" className="flex-1">
                  {meta.label}
                </Text>
                <IconButton
                  icon="x"
                  label={`Remove ${meta.label}`}
                  size={16}
                  className="size-8"
                  onPress={() => onChange(links.filter((_, i) => i !== index))}
                />
              </View>
              <Input
                value={link.value}
                onChangeText={(value) => set(index, { value })}
                placeholder={meta.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {(link.platform === "website" || link.platform === "custom") && (
                <Input
                  value={link.label}
                  onChangeText={(label) => set(index, { label })}
                  placeholder="Label (optional)"
                />
              )}
            </Card>
          );
        })}
        {picking ? (
          <Card className="flex-row flex-wrap gap-2 p-3">
            {PLATFORMS.map((platform) => (
              <Pressable
                key={platform.key}
                onPress={() => {
                  onChange([...links, { id: linkId(), platform: platform.key, value: "", label: "" }]);
                  setPicking(false);
                }}
                className="border-border active:bg-muted flex-row items-center gap-1.5 rounded-full border px-3 py-1.5"
              >
                <LinkIcon platform={platform.key} size={14} />
                <Text size="sm">{platform.label}</Text>
              </Pressable>
            ))}
          </Card>
        ) : (
          <Button variant="outline" size="sm" icon="plus" className="self-start" onPress={() => setPicking(true)}>
            Add link
          </Button>
        )}
      </View>
    </Field>
  );
}

// Refetched each time the screen opens, behind the cached values it shows at once.
const REFRESH = [queryKeys.me];

export default function ProfileSettings() {
  useRefreshOnFocus(REFRESH);
  const api = useApi();
  const queryClient = useQueryClient();
  const { user } = useViewer();
  const server = serverValues(user);
  const [base, setBase] = useState(server);
  const [displayName, setDisplayName] = useState(server.displayName);
  const [bio, setBio] = useState(server.bio);
  const [publicEmail, setPublicEmail] = useState(server.publicEmail);
  const [tags, setTags] = useState(server.tags);
  const [links, setLinks] = useState<LinkDraft[]>(() => withIds(server.links));
  const [section, setSection] = useState(server.section);
  // Refreshed in the background (useRefreshOnFocus): fields not edited here take the new values.
  if (user && !sameValues(base, server)) {
    const current = { displayName, bio, publicEmail, tags, section, links: withoutIds(links) };
    const merged = mergeUnedited(current, base, server);
    setDisplayName(merged.displayName);
    setBio(merged.bio);
    setPublicEmail(merged.publicEmail);
    setTags(merged.tags);
    setSection(merged.section);
    if (merged.links !== current.links) setLinks(withIds(merged.links));
    setBase(server);
  }
  const [sectionTab, setSectionTab] = useState<"write" | "preview">("write");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refreshMe = () => queryClient.invalidateQueries({ queryKey: queryKeys.me });

  const avatar = useMutation({
    mutationFn: async (remove: boolean) => {
      if (remove) return api.removeAvatar();
      const uri = await pickImage({ square: true });
      if (!uri) return null;
      const image = await prepareImage(uri, AVATAR_SIZE);
      return api.uploadAvatar(image.bytes, image.contentType);
    },
    onSuccess: () => void refreshMe(),
    onError: (err) => toast(errorMessage(err), "error"),
  });

  const save = useMutation({
    mutationFn: async () => {
      const resolved: ProfileLink[] = [];
      for (const link of links) {
        if (!link.value.trim()) continue;
        const url = identifierToUrl(link.platform, link.value);
        if (!url) throw new Error(`Check the ${platformMeta(link.platform).label} link.`);
        resolved.push({ platform: link.platform, url, label: link.label.trim() });
      }
      return api.updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        publicEmail: publicEmail.trim(),
        customSection: section,
        tags: tags
          .split(",")
          .map((tag) => tag.trim().replace(/^#/, ""))
          .filter(Boolean)
          .slice(0, MAX_TAGS),
        links: resolved,
      });
    },
    onSuccess: async () => {
      await refreshMe();
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast("Profile saved");
      goBack();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (!user) return null;
  return (
    <FormScreen
      title="Edit profile"
      right={
        <Button
          variant="solid"
          size="sm"
          loading={save.isPending}
          disabled={!displayName.trim()}
          onPress={() => save.mutate()}
        >
          Save
        </Button>
      }
    >
      <View className="flex-row items-center gap-4">
        <UserAvatar name={displayName || user.username} url={user.avatarUrl} size={72} />
        <View className="gap-2">
          <Button
            variant="outline"
            size="sm"
            icon="camera"
            loading={avatar.isPending}
            onPress={() => avatar.mutate(false)}
          >
            Change photo
          </Button>
          {user.avatarUrl && (
            <Button variant="ghost" size="sm" onPress={() => avatar.mutate(true)}>
              Remove photo
            </Button>
          )}
        </View>
      </View>

      <Field label="Display name">
        <Input value={displayName} onChangeText={(t) => setDisplayName(t.slice(0, MAX_NAME))} />
      </Field>
      <Field label="Bio" hint={`${bio.length}/${MAX_BIO}`}>
        <Input
          value={bio}
          onChangeText={(t) => setBio(t.slice(0, MAX_BIO))}
          multiline
          className="h-24 py-2.5"
          textAlignVertical="top"
        />
      </Field>
      <Field label="Public email" hint="Optional. Shown on your profile's About tab.">
        <Input value={publicEmail} onChangeText={setPublicEmail} autoCapitalize="none" keyboardType="email-address" />
      </Field>
      <Field label="Topics" hint={`Up to ${MAX_TAGS}, separated by commas.`}>
        <Input value={tags} onChangeText={setTags} autoCapitalize="none" placeholder="writing, design" />
      </Field>
      <LinksEditor links={links} onChange={setLinks} />

      <Field label="About section" hint="Markdown, shown on your profile's About tab.">
        <PillTabs
          tabs={[
            { value: "write", label: "Write" },
            { value: "preview", label: "Preview" },
          ]}
          value={sectionTab}
          onChange={(tab) => {
            setSectionTab(tab);
            if (tab === "preview")
              void api.previewCustomSection(section).then(
                ({ html }) => setPreview(html),
                (err) => setPreview(`<p>${errorMessage(err)}</p>`),
              );
          }}
        />
        {sectionTab === "write" ? (
          <Input
            value={section}
            onChangeText={(t) => setSection(t.slice(0, MAX_SECTION))}
            multiline
            className="h-48 py-2.5"
            textAlignVertical="top"
            autoCapitalize="sentences"
          />
        ) : (
          <Card>{preview ? <HtmlContent html={preview} /> : <Text tone="muted">Nothing to preview.</Text>}</Card>
        )}
      </Field>
      <FormError message={error} />
    </FormScreen>
  );
}
