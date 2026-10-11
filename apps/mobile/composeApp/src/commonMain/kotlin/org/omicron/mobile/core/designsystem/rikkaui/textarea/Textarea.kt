package org.omicron.mobile.core.designsystem.rikkaui.textarea

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
fun Textarea(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    label: String = "",
    enabled: Boolean = true,
    minLines: Int = 3,
    maxLines: Int = Int.MAX_VALUE,
    isError: Boolean = false,
    errorMessage: String = "",
    style: TextStyle = TextStyle.Default,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    maxLength: Int? = null,
    showCharCount: Boolean = false,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()
    val colors = RikkaTheme.colors
    val shape = RikkaTheme.shapes.md
    val spacing = RikkaTheme.spacing
    val borderColor by
        animateColorAsState(
            targetValue =
                when {
                    isError -> colors.destructive
                    focused -> colors.ring
                    else -> colors.border
                },
            animationSpec = tween(RikkaTheme.motion.durationDefault),
        )
    val typography = RikkaTheme.typography.p.merge(style)
    Column(modifier.fillMaxWidth()) {
        BasicTextField(
            value = value,
            onValueChange = { onValueChange(if (maxLength == null) it else it.take(maxLength)) },
            modifier =
                Modifier.fillMaxWidth().heightIn(min = 48.dp).semantics {
                    contentDescription = label.ifEmpty { placeholder }
                    if (isError && errorMessage.isNotEmpty()) error(errorMessage)
                },
            enabled = enabled,
            textStyle = typography.copy(color = colors.onBackground),
            minLines = minLines,
            maxLines = maxLines,
            keyboardOptions = keyboardOptions,
            interactionSource = interactionSource,
            cursorBrush = SolidColor(colors.onBackground),
            decorationBox = { field ->
                Box(
                    Modifier.border(1.dp, borderColor, shape)
                        .background(colors.background, shape)
                        .clip(shape)
                        .padding(horizontal = spacing.md, vertical = spacing.sm),
                ) {
                    if (value.isEmpty())
                        BasicText(placeholder, style = typography.copy(color = colors.onMuted))
                    field()
                }
            },
        )
        if (showCharCount && maxLength != null) {
            BasicText(
                text = "${value.length}/$maxLength",
                style = RikkaTheme.typography.small.copy(color = colors.onMuted),
                modifier = Modifier.padding(top = spacing.xs),
            )
        }
    }
}
