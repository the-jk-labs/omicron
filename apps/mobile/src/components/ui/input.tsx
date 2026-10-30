import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import type { ComponentProps, ComponentRef, ReactNode, Ref } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { cn } from "tailwind-variants";
import { withUniwind } from "uniwind";
import { Text } from "./text";

// The web's input: `rounded-input border border-input bg-background h-10 px-4 text-sm`.
export const inputClass =
  "h-11 rounded-input border border-border-input bg-background px-4 font-sans text-[15px] text-foreground";

export type InputProps = TextInputProps & {
  className?: string;
  invalid?: boolean;
  ref?: Ref<ComponentRef<typeof TextInput>>;
};

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <TextInput
      placeholderTextColorClassName="accent-muted-foreground"
      selectionColorClassName="accent-foreground"
      cursorColorClassName="accent-foreground"
      className={cn(inputClass, invalid && "border-destructive", className)}
      {...props}
    />
  );
}

const StyledSheetInput = withUniwind(BottomSheetTextInput);

/** An input inside a bottom sheet: only Gorhom's own input lets the sheet rise above the keyboard. */
export function SheetInput(props: ComponentProps<typeof StyledSheetInput>) {
  return <StyledSheetInput {...props} />;
}

export type FieldProps = {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  right?: ReactNode;
};

/** Label + control + hint/error, the web's `Label` above an input. */
export function Field({ label, hint, error, children, right }: FieldProps) {
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between">
        <Text size="sm" weight="medium">
          {label}
        </Text>
        {right}
      </View>
      {children}
      {error ? (
        <Text size="xs" tone="destructive">
          {error}
        </Text>
      ) : (
        hint && (
          <Text size="xs" tone="muted">
            {hint}
          </Text>
        )
      )}
    </View>
  );
}
