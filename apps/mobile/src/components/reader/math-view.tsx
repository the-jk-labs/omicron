import { ScrollView, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { useThemeColor } from "@/hooks/use-theme-colors";
import type { Formula } from "@/lib/html/parse";
import { typesetMath } from "@/lib/math/typeset";

// Matches the article body (`BODY` in html-content.tsx).
const FONT_SIZE = 17;
const DISPLAY_SIZE = 19;

/** One formula, drawn natively. Inline formulas sit on the line's baseline; display ones are centred. */
export function MathView({ formula, display }: { formula: Formula; display: boolean }) {
  const color = useThemeColor("--color-foreground");
  const math = typesetMath(formula.mathml, display);
  // Shouldn't happen with the backend's MathML, but the TeX source still says what the formula was.
  if (!math) return <Text className="text-foreground font-content">{formula.tex}</Text>;

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
