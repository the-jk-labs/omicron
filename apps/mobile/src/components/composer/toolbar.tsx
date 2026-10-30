import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { cn } from "tailwind-variants";
import { Icon, type IconName } from "@/components/ui/icon";
import { PressableScale } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import type { EditorCommand, OmicronEditorState } from "@/lib/editor/omicron-bridge";

function ToolButton({
  icon,
  label,
  active = false,
  disabled = false,
  onPress,
  children,
}: {
  icon?: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children?: ReactNode;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      pressedScale={0.88}
      onPress={onPress}
      className={cn(
        "size-10 items-center justify-center rounded-button",
        active && "bg-muted",
        disabled && "opacity-40",
      )}
    >
      {icon ? <Icon name={icon} size={19} className={active ? "text-foreground" : "text-foreground-alt"} /> : children}
    </PressableScale>
  );
}

const Divider = () => <View className="bg-border mx-1 h-6 w-px" />;

/** The web editor's toolbar, as one scrolling row above the keyboard. */
export function ComposerToolbar({
  state,
  run,
  onImage,
  onLink,
}: {
  state: OmicronEditorState | undefined;
  run: (command: EditorCommand) => void;
  onImage: () => void;
  onLink: () => void;
}) {
  const active = state?.active;
  const heading = state?.headingLevel;
  const inTable = Boolean(active?.table);

  return (
    <View className="border-border bg-background border-t">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerClassName="items-center px-2 py-1"
      >
        <ToolButton icon="undo-2" label="Undo" disabled={!state?.canUndo} onPress={() => run({ name: "undo" })} />
        <ToolButton icon="redo-2" label="Redo" disabled={!state?.canRedo} onPress={() => run({ name: "redo" })} />
        <Divider />
        <ToolButton label="Heading 2" active={heading === 2} onPress={() => run({ name: "heading", level: 2 })}>
          <Text size="sm" weight="bold" tone={heading === 2 ? "default" : "alt"}>
            H2
          </Text>
        </ToolButton>
        <ToolButton label="Heading 3" active={heading === 3} onPress={() => run({ name: "heading", level: 3 })}>
          <Text size="sm" weight="bold" tone={heading === 3 ? "default" : "alt"}>
            H3
          </Text>
        </ToolButton>
        <ToolButton icon="bold" label="Bold" active={active?.bold} onPress={() => run({ name: "bold" })} />
        <ToolButton icon="italic" label="Italic" active={active?.italic} onPress={() => run({ name: "italic" })} />
        <ToolButton
          icon="strikethrough"
          label="Strikethrough"
          active={active?.strike}
          onPress={() => run({ name: "strike" })}
        />
        <ToolButton icon="link" label="Link" active={active?.link} onPress={onLink} />
        <Divider />
        <ToolButton
          icon="list"
          label="Bullet list"
          active={active?.bulletList}
          onPress={() => run({ name: "bulletList" })}
        />
        <ToolButton
          icon="list-ordered"
          label="Numbered list"
          active={active?.orderedList}
          onPress={() => run({ name: "orderedList" })}
        />
        <ToolButton
          icon="quote"
          label="Quote"
          active={active?.blockquote}
          onPress={() => run({ name: "blockquote" })}
        />
        <ToolButton icon="code" label="Inline code" active={active?.code} onPress={() => run({ name: "code" })} />
        <ToolButton
          icon="square-code"
          label="Code block"
          active={active?.codeBlock}
          onPress={() => run({ name: "codeBlock" })}
        />
        <ToolButton icon="minus" label="Divider" onPress={() => run({ name: "horizontalRule" })} />
        <ToolButton icon="image" label="Insert image" onPress={onImage} />
        <ToolButton
          icon="table"
          label="Insert table"
          active={inTable}
          onPress={() => run({ name: inTable ? "addRowAfter" : "insertTable" })}
        />
        {inTable && (
          <>
            <ToolButton
              icon="between-vertical-end"
              label="Add column"
              onPress={() => run({ name: "addColumnAfter" })}
            />
            <ToolButton icon="trash-2" label="Delete table" onPress={() => run({ name: "deleteTable" })} />
          </>
        )}
      </ScrollView>
    </View>
  );
}
