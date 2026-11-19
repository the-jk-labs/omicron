import { createContext, use, type ReactNode } from "react";
import { TextInput, type TextInputProps } from "react-native";

// Form field stand-ins: a Field names the input inside it, as a <label> would.
const Label = createContext<string | undefined>(undefined);

export const Field = ({ label, children }: { label: string; children?: ReactNode }) => (
  <Label value={label}>{children}</Label>
);

export const Input = (props: TextInputProps) => <TextInput aria-label={use(Label)} {...props} />;
