package org.omicron.mobile.core.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import org.jetbrains.compose.resources.Font
import org.omicron.mobile.domain.model.AppearancePreference
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.inter_variable
import org.omicron.mobile.resources.source_sans3_italic_variable
import org.omicron.mobile.resources.source_sans3_variable
import zed.rainxch.rikkaui.foundation.RikkaColors
import zed.rainxch.rikkaui.foundation.RikkaElevation
import zed.rainxch.rikkaui.foundation.RikkaShapes
import zed.rainxch.rikkaui.foundation.RikkaTheme
import zed.rainxch.rikkaui.foundation.rikkaTypography

data class OmicronColorTokens(
    val background: Color,
    val backgroundAlt: Color,
    val foreground: Color,
    val foregroundAlt: Color,
    val muted: Color,
    val mutedForeground: Color,
    val borderCard: Color,
    val borderInput: Color,
    val dark: Color,
    val dark10: Color,
    val dark40: Color,
    val dark04: Color,
    val accent: Color,
    val accentForeground: Color,
    val destructive: Color,
    val tertiary: Color,
    val line: Color,
    val contrast: Color,
    val scrollbarThumb: Color,
    val scrollbarThumbHover: Color,
)

data class OmicronCodeTokens(
    val comment: Color,
    val keyword: Color,
    val string: Color,
    val literal: Color,
    val type: Color,
)

data class OmicronRadii(
    val card: Dp,
    val cardLarge: Dp,
    val cardSmall: Dp,
    val input: Dp,
    val button: Dp,
    val radius5: Dp,
    val radius9: Dp,
    val radius10: Dp,
    val radius15: Dp,
)

data class OmicronShadow(
    val offsetX: Dp,
    val offsetY: Dp,
    val blurRadius: Dp,
    val spreadRadius: Dp,
    val color: Color,
    val inset: Boolean = false,
)

data class OmicronShadows(
    val mini: OmicronShadow,
    val miniInset: OmicronShadow,
    val popover: OmicronShadow,
    val keyboard: OmicronShadow,
    val button: OmicronShadow,
    val card: OmicronShadow,
)

data class OmicronFontFamilies(
    val ui: FontFamily,
    val content: FontFamily,
)

object OmicronFontStacks {
    const val Interface = "Twemoji, Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    const val Content = "Twemoji, Source Sans 3 Variable, Source Sans 3, ui-sans-serif, system-ui, sans-serif"
    const val Serif = "Twemoji, Georgia, Cambria, Times New Roman, serif"
}

val OmicronLightColors = OmicronColorTokens(
    background = hsl(0f, 0f, 100f),
    backgroundAlt = hsl(0f, 0f, 100f),
    foreground = hsl(0f, 0f, 9f),
    foregroundAlt = hsl(0f, 0f, 32f),
    muted = hsl(240f, 5f, 96f),
    mutedForeground = hsl(0f, 0f, 9f, 0.65f),
    borderCard = hsl(240f, 6f, 10f, 0.1f),
    borderInput = hsl(240f, 6f, 10f, 0.17f),
    dark = hsl(240f, 6f, 10f),
    dark10 = hsl(240f, 6f, 10f, 0.1f),
    dark40 = hsl(240f, 6f, 10f, 0.4f),
    dark04 = hsl(240f, 6f, 10f, 0.04f),
    accent = hsl(204f, 94f, 94f),
    accentForeground = hsl(204f, 80f, 16f),
    destructive = hsl(347f, 77f, 50f),
    tertiary = hsl(37.7f, 92.1f, 50.2f),
    line = hsl(0f, 0f, 100f),
    contrast = hsl(0f, 0f, 0f),
    scrollbarThumb = hsl(0f, 0f, 9f, 0.25f),
    scrollbarThumbHover = hsl(0f, 0f, 9f, 0.45f),
)

val OmicronDarkColors = OmicronColorTokens(
    background = hsl(0f, 0f, 5f),
    backgroundAlt = hsl(0f, 0f, 8f),
    foreground = hsl(0f, 0f, 95f),
    foregroundAlt = hsl(0f, 0f, 70f),
    muted = hsl(240f, 4f, 16f),
    mutedForeground = hsl(0f, 0f, 100f, 0.55f),
    borderCard = hsl(0f, 0f, 96f, 0.1f),
    borderInput = hsl(0f, 0f, 96f, 0.17f),
    dark = hsl(0f, 0f, 96f),
    dark10 = hsl(0f, 0f, 96f, 0.1f),
    dark40 = hsl(0f, 0f, 96f, 0.4f),
    dark04 = hsl(0f, 0f, 96f, 0.04f),
    accent = hsl(204f, 90f, 90f),
    accentForeground = hsl(204f, 94f, 94f),
    destructive = hsl(350f, 89f, 60f),
    tertiary = hsl(61.3f, 100f, 82.2f),
    line = hsl(0f, 0f, 9.02f),
    contrast = hsl(0f, 0f, 100f),
    scrollbarThumb = hsl(0f, 0f, 100f, 0.22f),
    scrollbarThumbHover = hsl(0f, 0f, 100f, 0.4f),
)

val OmicronLightCode = OmicronCodeTokens(
    comment = hsl(215f, 14f, 47f),
    keyword = hsl(356f, 76f, 47f),
    string = hsl(213f, 82f, 27f),
    literal = hsl(212f, 92f, 35f),
    type = hsl(137f, 69f, 24f),
)

val OmicronDarkCode = OmicronCodeTokens(
    comment = hsl(213f, 8f, 62f),
    keyword = hsl(5f, 100f, 72f),
    string = hsl(208f, 100f, 82f),
    literal = hsl(208f, 100f, 74f),
    type = hsl(138f, 74f, 73f),
)

val OmicronRadiiTokens = OmicronRadii(
    card = 16.dp,
    cardLarge = 20.dp,
    cardSmall = 10.dp,
    input = 9.dp,
    button = 5.dp,
    radius5 = 5.dp,
    radius9 = 9.dp,
    radius10 = 10.dp,
    radius15 = 15.dp,
)

val OmicronShadowTokens = OmicronShadows(
    mini = OmicronShadow(0.dp, 1.dp, 0.dp, 1.dp, Color.Black.copy(alpha = 0.04f)),
    miniInset = OmicronShadow(0.dp, 1.dp, 0.dp, 0.dp, Color.Black.copy(alpha = 0.04f), inset = true),
    popover = OmicronShadow(0.dp, 7.dp, 12.dp, 3.dp, Color(24 / 255f, 24 / 255f, 27 / 255f, 0.1f)),
    keyboard = OmicronShadow(0.dp, 2.dp, 0.dp, 0.dp, Color.Black.copy(alpha = 0.07f)),
    button = OmicronShadow(0.dp, 1.dp, 0.dp, 1.dp, Color.Black.copy(alpha = 0.03f)),
    card = OmicronShadow(0.dp, 2.dp, 0.dp, 1.dp, Color.Black.copy(alpha = 0.04f)),
)

private val LocalOmicronColors = staticCompositionLocalOf<OmicronColorTokens> {
    error("OmicronTheme has not been provided")
}

private val LocalOmicronCode = staticCompositionLocalOf<OmicronCodeTokens> {
    error("OmicronTheme has not been provided")
}

private val LocalOmicronRadii = staticCompositionLocalOf<OmicronRadii> {
    error("OmicronTheme has not been provided")
}

private val LocalOmicronShadows = staticCompositionLocalOf<OmicronShadows> {
    error("OmicronTheme has not been provided")
}

private val LocalOmicronFonts = staticCompositionLocalOf<OmicronFontFamilies> {
    error("OmicronTheme has not been provided")
}

object OmicronTheme {
    val colors: OmicronColorTokens
        @Composable
        @ReadOnlyComposable
        get() = LocalOmicronColors.current

    val code: OmicronCodeTokens
        @Composable
        @ReadOnlyComposable
        get() = LocalOmicronCode.current

    val radii: OmicronRadii
        @Composable
        @ReadOnlyComposable
        get() = LocalOmicronRadii.current

    val shadows: OmicronShadows
        @Composable
        @ReadOnlyComposable
        get() = LocalOmicronShadows.current

    val uiFontFamily: FontFamily
        @Composable
        @ReadOnlyComposable
        get() = LocalOmicronFonts.current.ui

    val contentFontFamily: FontFamily
        @Composable
        @ReadOnlyComposable
        get() = LocalOmicronFonts.current.content
}

@Composable
fun OmicronTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    appearance: AppearancePreference? = null,
    onDarkThemeChanged: ((Boolean) -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val useDarkTheme = resolveDarkTheme(darkTheme, appearance)
    LaunchedEffect(useDarkTheme) {
        onDarkThemeChanged?.invoke(useDarkTheme)
    }
    val colors = if (useDarkTheme) OmicronDarkColors else OmicronLightColors
    val code = if (useDarkTheme) OmicronDarkCode else OmicronLightCode
    val fonts =
        OmicronFontFamilies(
            ui =
                FontFamily(
                    Font(Res.font.inter_variable, FontWeight.W100),
                    Font(Res.font.inter_variable, FontWeight.W200),
                    Font(Res.font.inter_variable, FontWeight.W300),
                    Font(Res.font.inter_variable, FontWeight.W400),
                    Font(Res.font.inter_variable, FontWeight.W500),
                    Font(Res.font.inter_variable, FontWeight.W600),
                    Font(Res.font.inter_variable, FontWeight.W700),
                    Font(Res.font.inter_variable, FontWeight.W800),
                    Font(Res.font.inter_variable, FontWeight.W900),
                ),
            content =
                FontFamily(
                    Font(Res.font.source_sans3_variable, FontWeight.W200),
                    Font(Res.font.source_sans3_variable, FontWeight.W300),
                    Font(Res.font.source_sans3_variable, FontWeight.W400),
                    Font(Res.font.source_sans3_variable, FontWeight.W500),
                    Font(Res.font.source_sans3_variable, FontWeight.W600),
                    Font(Res.font.source_sans3_variable, FontWeight.W700),
                    Font(Res.font.source_sans3_variable, FontWeight.W800),
                    Font(Res.font.source_sans3_variable, FontWeight.W900),
                    Font(Res.font.source_sans3_italic_variable, FontWeight.W200, FontStyle.Italic),
                    Font(Res.font.source_sans3_italic_variable, FontWeight.W300, FontStyle.Italic),
                    Font(Res.font.source_sans3_italic_variable, FontWeight.W400, FontStyle.Italic),
                    Font(Res.font.source_sans3_italic_variable, FontWeight.W500, FontStyle.Italic),
                    Font(Res.font.source_sans3_italic_variable, FontWeight.W600, FontStyle.Italic),
                    Font(Res.font.source_sans3_italic_variable, FontWeight.W700, FontStyle.Italic),
                    Font(Res.font.source_sans3_italic_variable, FontWeight.W800, FontStyle.Italic),
                    Font(Res.font.source_sans3_italic_variable, FontWeight.W900, FontStyle.Italic),
                ),
        )
    RikkaTheme(
        colors = colors.toRikkaColors(),
        typography = rikkaTypography(fontFamily = fonts.ui),
        shapes = RikkaShapes(
            sm = RoundedCornerShape(OmicronRadiiTokens.button),
            md = RoundedCornerShape(OmicronRadiiTokens.input),
            lg = RoundedCornerShape(OmicronRadiiTokens.card),
            xl = RoundedCornerShape(OmicronRadiiTokens.cardLarge),
            full = RoundedCornerShape(50),
        ),
        elevation = RikkaElevation(
            low = OmicronShadowTokens.button.offsetY,
            medium = OmicronShadowTokens.popover.offsetY,
            high = OmicronShadowTokens.popover.blurRadius,
        ),
        minTouchTarget = 48.dp,
    ) {
        CompositionLocalProvider(
            LocalOmicronColors provides colors,
            LocalOmicronCode provides code,
            LocalOmicronRadii provides OmicronRadiiTokens,
            LocalOmicronShadows provides OmicronShadowTokens,
            LocalOmicronFonts provides fonts,
            content = content,
        )
    }
}

internal fun resolveDarkTheme(systemDarkTheme: Boolean, appearance: AppearancePreference?): Boolean =
    when (appearance) {
        AppearancePreference.Light -> false
        AppearancePreference.Dark -> true
        AppearancePreference.System, null -> systemDarkTheme
    }

internal fun OmicronColorTokens.toRikkaColors() = RikkaColors(
    background = background,
    onBackground = foreground,
    surface = backgroundAlt,
    onSurface = foreground,
    primary = dark,
    onPrimary = background,
    secondary = muted,
    onSecondary = foreground,
    muted = muted,
    onMuted = mutedForeground,
    destructive = destructive,
    onDestructive = background,
    warning = tertiary,
    onWarning = dark,
    success = accent,
    onSuccess = accentForeground,
    border = borderCard,
    borderSubtle = borderCard,
    ring = dark,
    scrim = dark40,
    inverseSurface = contrast,
    onInverseSurface = line,
    primaryTinted = accent,
    onPrimaryTinted = accentForeground,
    destructiveTinted = destructive.copy(alpha = 0.1f),
    onDestructiveTinted = destructive,
    primaryHover = dark.copy(alpha = 0.95f),
    primaryPressed = dark.copy(alpha = 0.95f),
    destructiveHover = destructive,
    destructivePressed = destructive,
    secondaryHover = muted,
    secondaryPressed = muted,
)

private fun hsl(
    hue: Float,
    saturation: Float,
    lightness: Float,
    alpha: Float = 1f,
): Color = Color.hsl(hue, saturation / 100f, lightness / 100f, alpha)
