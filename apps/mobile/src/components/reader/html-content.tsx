import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { createContext, memo, use, useMemo, useState, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, Text as RNText, View } from "react-native";
import Animated, { FadeIn, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { cn } from "tailwind-variants";
import { useInstance } from "@/components/instance-provider";
import { IconButton } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { toast } from "@/lib/dialogs/toast";
import { codeLanguageLabel } from "@/lib/html/code-languages";
import { highlightCode, type TokenTone } from "@/lib/html/highlight";
import { type Block, type Inline, type Marks } from "@/lib/html/parse";
import { parseCached } from "@/lib/html/parse-cache";
import { MathView } from "./math-view";

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

const TONE_CLASS: Record<TokenTone, string> = {
  comment: "font-content-italic text-hl-comment",
  keyword: "text-hl-keyword",
  string: "text-hl-string",
  name: "text-hl-name",
  literal: "text-hl-literal",
  type: "text-hl-type",
  deletion: "text-destructive",
};

// React Native can't synthesize bold or italic, so each combination picks its own family.
function markClass(marks: Marks) {
  const family =
    marks.bold && marks.italic
      ? "font-content-semibold-italic"
      : marks.bold
        ? "font-content-bold"
        : marks.italic
          ? "font-content-italic"
          : undefined;
  return cn(
    family,
    marks.strike && "line-through",
    (marks.underline || marks.href) && "underline",
    // No em sizing: Uniwind's `em` reads the variable it sets and recurses (tests/lib/uniwind-classes.test.ts).
    (marks.code || marks.kbd) && "bg-muted",
    (marks.sub || marks.sup) && "text-xs",
  );
}

/** Opens a link from a post: Omicron paths on this instance stay in the app, everything else in the browser. */
function useOpenLink() {
  const { origin } = useInstance();
  return (href: string) => {
    let url: URL;
    try {
      url = new URL(href, origin);
    } catch {
      return;
    }
    if (url.origin === origin && /^\/(@|tags\/|lists\/)/.test(url.pathname)) {
      router.push(url.pathname);
      return;
    }
    if (url.protocol === "https:" || url.protocol === "http:") void WebBrowser.openBrowserAsync(url.href);
    else if (url.protocol === "mailto:") void WebBrowser.openBrowserAsync(url.href);
  };
}

function InlineRuns({ items }: { items: Inline[] }) {
  const openLink = useOpenLink();
  return items.map((item, index) => {
    if (item.type === "break") return "\n";
    if (item.type === "image") return item.alt ? `[${item.alt}]` : null;
    if (item.type === "math") return <MathView key={index} formula={item} display={false} />;
    const { marks } = item;
    return (
      <RNText
        key={index}
        className={markClass(marks)}
        style={marks.code || marks.kbd ? { fontFamily: MONO } : undefined}
        onPress={marks.href ? () => openLink(marks.href!) : undefined}
        accessibilityRole={marks.href ? "link" : undefined}
      >
        {item.text}
      </RNText>
    );
  });
}

const HEADING_CLASS = {
  1: "mt-10 mb-4 text-3xl font-content-bold",
  2: "mt-8 mb-3 text-2xl font-content-bold",
  3: "mt-7 mb-2 text-xl font-content-bold",
  4: "mt-6 mb-2 text-lg font-content-semibold",
  5: "mt-6 mb-2 text-base font-content-semibold",
  6: "mt-6 mb-2 text-sm font-content-semibold uppercase text-muted-foreground",
} as const;

// `.prose-omicron` from the web: Source Sans 3 at 17px with roomy leading.
const BODY = "font-content text-[17px] leading-[30px] text-foreground";

// Inside a blockquote the web sets text italic and in foreground-alt.
const QuoteContext = createContext(false);

function ContentImage({ src, alt, widthPercent }: { src: string; alt: string; widthPercent: number | null }) {
  const { media } = useInstance();
  const [ratio, setRatio] = useState<number | null>(null);
  const uri = media(src);
  if (!uri) return null;
  return (
    <View className="my-6 items-center">
      <Image
        source={uri}
        accessibilityLabel={alt || undefined}
        contentFit="cover"
        transition={180}
        // Only the first load sets the shape: the resize makes expo-image decode again at the new size, and
        // taking that decode's ratio too reloaded the image forever.
        onLoad={({ source }) => source.width && setRatio((current) => current ?? source.width / source.height)}
        style={{ width: `${widthPercent ?? 100}%`, aspectRatio: ratio ?? 16 / 9, borderRadius: 16 }}
      />
    </View>
  );
}

function CodeBlock({ code, language, title }: { code: string; language: string | null; title: string | null }) {
  const tokens = useMemo(() => highlightCode(code, language), [code, language]);
  const caption = title ?? (language ? codeLanguageLabel(language) : "");
  return (
    <View className="my-6 overflow-hidden rounded-lg bg-muted">
      <View className="flex-row items-center justify-between pr-1 pl-4">
        <Text size="xs" weight="medium" tone="muted" numberOfLines={1} className="flex-1">
          {caption}
        </Text>
        <IconButton
          icon="copy"
          label="Copy code"
          size={15}
          className="size-9"
          onPress={() => {
            void Clipboard.setStringAsync(code);
            toast("Code copied");
          }}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-4 pb-4">
        <RNText selectable className="text-[13px] leading-5 text-foreground" style={{ fontFamily: MONO }}>
          {tokens.map((token, index) => (
            <RNText key={index} className={token.tone ? TONE_CLASS[token.tone] : undefined}>
              {token.text}
            </RNText>
          ))}
        </RNText>
      </ScrollView>
    </View>
  );
}

function Details({ summary, children }: { summary: Inline[]; children: Block[] }) {
  const [open, setOpen] = useState(false);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: withTiming(open ? "90deg" : "0deg") }] }));
  return (
    <View className="my-5 rounded-card-sm border border-border">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        className="flex-row items-center gap-2 px-4 py-3"
      >
        <Animated.View style={chevron}>
          <Icon name="chevron-right" size={16} />
        </Animated.View>
        <RNText className="flex-1 font-content-semibold text-base text-foreground">
          <InlineRuns items={summary} />
        </RNText>
      </Pressable>
      {open && (
        <Animated.View entering={FadeIn.duration(160)} className="px-4 pb-2">
          <Blocks blocks={children} />
        </Animated.View>
      )}
    </View>
  );
}

function Table({ rows }: { rows: { header: boolean; cells: Block[][] }[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="my-6">
      <View className="border-t border-l border-border">
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} className={cn("flex-row", row.header && "bg-muted")}>
            {row.cells.map((cell, cellIndex) => (
              <View key={cellIndex} className="w-40 border-r border-b border-border px-3 py-2">
                <Blocks blocks={cell} compact />
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function BlockView({ block, compact }: { block: Block; compact?: boolean }): ReactNode {
  const quoted = use(QuoteContext);
  switch (block.type) {
    case "paragraph":
      return (
        <RNText
          selectable
          className={cn(BODY, compact ? "my-0" : "my-2.5", quoted && "font-content-italic text-foreground-alt")}
        >
          <InlineRuns items={block.children} />
        </RNText>
      );
    case "heading":
      return (
        <RNText accessibilityRole="header" className={cn("text-foreground", HEADING_CLASS[block.level])}>
          <InlineRuns items={block.children} />
        </RNText>
      );
    case "blockquote":
      return (
        <View className="my-6 border-l-[3px] border-foreground pl-5">
          <QuoteContext value>
            <Blocks blocks={block.children} />
          </QuoteContext>
        </View>
      );
    case "list":
      return (
        <View className="my-3 gap-1">
          {block.items.map((item, index) => (
            <View key={index} className="flex-row">
              <RNText className={cn(BODY, "w-7")}>{block.ordered ? `${block.start + index}.` : "•"}</RNText>
              <View className="flex-1">
                <Blocks blocks={item} compact />
              </View>
            </View>
          ))}
        </View>
      );
    case "code":
      return <CodeBlock code={block.code} language={block.language} title={block.title} />;
    case "image":
      return <ContentImage src={block.src} alt={block.alt} widthPercent={block.widthPercent} />;
    case "rule":
      return <View className="my-10 h-px bg-border" />;
    case "table":
      return <Table rows={block.rows} />;
    case "details":
      return <Details summary={block.summary}>{block.children}</Details>;
    case "math":
      return <MathView formula={block} display />;
    default: {
      const unknown: never = block;
      return unknown;
    }
  }
}

const blockFallback = () => (
  <Text size="sm" tone="muted" className="my-3">
    This part of the post couldn't be shown in the app.
  </Text>
);

function Blocks({ blocks, compact }: { blocks: Block[]; compact?: boolean }) {
  return (
    <View>
      {blocks.map((block, index) => (
        // One block that can't render leaves a note in its place instead of taking the whole post down.
        <ErrorBoundary key={index} fallback={blockFallback}>
          <BlockView block={block} compact={compact} />
        </ErrorBoundary>
      ))}
    </View>
  );
}

/** A post body rendered natively from its sanitized HTML, styled like the web's `.prose-omicron`. */
export const HtmlContent = memo(function HtmlContent({ html }: { html: string }) {
  const blocks = useMemo(() => parseCached(html), [html]);
  return <Blocks blocks={blocks} />;
});
