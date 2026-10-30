import type { Post } from "@omicron/contract";
import { Share } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { useInstance } from "@/components/instance-provider";
import { Icon, type IconName } from "@/components/ui/icon";
import { PressableScale } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/use-theme-colors";
import { postPath } from "@/lib/links";
import { useRequireSignIn, useToggleLike, useToggleRecommend } from "@/lib/query/engagement";

// One size for every post action, in feeds and the reader alike, as X does.
export const ACTION_ICON_SIZE = 19;

// Lucide's own outlines, drawn as SVG so the active state can fill them: the icon font has outlines only.
const FILLABLE = {
  heart:
    "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5",
  bookmark:
    "M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z",
};

type Fillable = keyof typeof FILLABLE;
const isFillable = (name: string): name is Fillable => name in FILLABLE;

type Tone = "like" | "repost" | "saved" | "none";
const TONE_TOKEN: Record<Tone, string> = {
  like: "--color-destructive",
  repost: "--color-repost",
  saved: "--color-saved",
  none: "--color-muted-foreground",
};
const TONE_CLASS: Record<Tone, string> = {
  like: "text-destructive",
  repost: "text-repost",
  saved: "text-saved",
  none: "text-muted-foreground",
};

function FillableIcon({ name, size, color, filled }: { name: Fillable; size: number; color: string; filled: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={FILLABLE[name]}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? color : "none"}
      />
    </Svg>
  );
}

/** Icon + count button. On, it takes its tone (and a fillable icon fills); `pops` pops it once when tapped on. */
export function ToggleButton({
  icon,
  active,
  count,
  label,
  tone,
  onPress,
  iconSize = ACTION_ICON_SIZE,
  pops = false,
}: {
  icon: IconName;
  active: boolean;
  count?: number;
  label: string;
  tone: Tone;
  onPress: () => void;
  iconSize?: number;
  pops?: boolean;
}) {
  const shown = active ? tone : "none";
  const [color] = useThemeColors([TONE_TOKEN[shown]]);
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  // On the tap itself, not when `active` turns true: the optimistic update, the server's answer and cache
  // refreshes each flip it again. Timing both ways: a spring back overshoots and reads as several pops.
  const press = () => {
    if (pops && !active) {
      scale.set(withSequence(withTiming(1.25, { duration: 110 }), withTiming(1, { duration: 150 })));
    }
    onPress();
  };

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={8}
      pressedScale={0.9}
      onPress={press}
      className="h-10 flex-row items-center gap-1.5 rounded-full px-2"
    >
      <Animated.View style={style}>
        {isFillable(icon) ? (
          <FillableIcon name={icon} size={iconSize} color={color} filled={active} />
        ) : (
          <Icon name={icon} size={iconSize} className={TONE_CLASS[shown]} />
        )}
      </Animated.View>
      {count !== undefined && count > 0 && (
        <Text size="sm" className={TONE_CLASS[shown]}>
          {count}
        </Text>
      )}
    </PressableScale>
  );
}

export function LikeButton({ post }: { post: Post }) {
  const toggle = useToggleLike();
  const requireSignIn = useRequireSignIn();
  return (
    <ToggleButton
      icon="heart"
      tone="like"
      pops
      active={post.liked}
      count={post.likeCount}
      label={post.liked ? "Unlike" : "Like"}
      onPress={() => requireSignIn(() => toggle.mutate({ id: post.id, on: !post.liked }))}
    />
  );
}

/** "Repost": federates as an ActivityPub Announce. */
export function RecommendButton({ post }: { post: Post }) {
  const toggle = useToggleRecommend();
  const requireSignIn = useRequireSignIn();
  return (
    <ToggleButton
      icon="repeat-2"
      tone="repost"
      pops
      // The glyph is short and wide, so at the shared size it reads smaller than its neighbours.
      iconSize={ACTION_ICON_SIZE + 3}
      active={post.recommended}
      count={post.recommendCount}
      label={post.recommended ? "Remove recommendation" : "Recommend"}
      onPress={() => requireSignIn(() => toggle.mutate({ id: post.id, on: !post.recommended }))}
    />
  );
}

/** Opens the comments: the post from a feed, or a scroll to them in the reader. */
export function CommentsButton({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <ToggleButton icon="message-circle" tone="none" active={false} count={count} label="Comments" onPress={onPress} />
  );
}

export function ShareButton({ post }: { post: Post }) {
  const { origin } = useInstance();
  const url = `${origin}${postPath(post)}`;
  return (
    <ToggleButton
      icon="share-2"
      tone="none"
      active={false}
      label="Share"
      onPress={() => void Share.share({ message: url, url })}
    />
  );
}
