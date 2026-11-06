import { useSyncExternalStore } from "react";
import { ScrollView, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { useThemeColor } from "@/hooks/use-theme-colors";
import type { Formula } from "@/lib/html/parse";
import { typesetResult, typesetWhenIdle } from "@/lib/math/typeset";

// Matches the article body (`BODY` in html-content.tsx).
const FONT_SIZE = 17;
const DISPLAY_SIZE = 19;

/** One formula, drawn natively. Inline formulas sit on the line's baseline; display ones are centred. */
export function MathView({ formula, display }: { formula: Formula; display: boolean }) {
  const color = useThemeColor("--color-foreground");
  const { mathml } = formula;
  // A store, not a plain call: the React Compiler would remember the first answer, "not typeset yet", for good.
  const math = useSyncExternalStore(
    (changed) =>
      typesetResult(mathml, display) === undefined ? typesetWhenIdle(mathml, display, changed) : () => undefined,
    () => typesetResult(mathml, display),
  );

  // Until it's typeset, the TeX source stands in, so the text around it can be read straight away.
  if (math === undefined) {
    return (
      <Text
        className={
          display ? "my-3 text-center font-content text-muted-foreground" : "font-content text-muted-foreground"
        }
      >
        {formula.tex}
      </Text>
    );
  }
  // Shouldn't happen with the backend's MathML, but the TeX source still says what the formula was.
  if (!math) return <Text className="font-content text-foreground">{formula.tex}</Text>;

  const size = display ? DISPLAY_SIZE : FONT_SIZE;
  const svg = <SvgXml xml={math.svg} color={color} width={math.width * size} height={math.height * size} />;
  if (!display) {
    return (
      // An inline view sits on the baseline by its bottom edge; drop it by the formula's depth.
      <View
        accessible
        accessibilityLabel={formula.tex || "Formula"}
        style={{ transform: [{ translateY: math.depth * size }] }}
      >
        {svg}
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessible
      accessibilityLabel={formula.tex || "Formula"}
      className="my-3"
      contentContainerClassName="grow justify-center py-1"
    >
      {svg}
    </ScrollView>
  );
}
