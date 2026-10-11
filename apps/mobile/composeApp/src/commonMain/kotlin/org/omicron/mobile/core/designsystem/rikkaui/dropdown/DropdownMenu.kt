package org.omicron.mobile.core.designsystem.rikkaui.dropdown

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import org.omicron.mobile.core.designsystem.rikkaui.icon.Icon
import org.omicron.mobile.core.designsystem.rikkaui.icon.IconSize
import org.omicron.mobile.core.designsystem.rikkaui.separator.Separator
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
fun DropdownMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    trigger: @Composable () -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    Box(modifier) {
        trigger()
        if (expanded) {
            Popup(
                popupPositionProvider = MenuPositionProvider,
                onDismissRequest = onDismiss,
                properties = PopupProperties(focusable = true),
            ) {
                val shape = RikkaTheme.shapes.md
                Column(
                    modifier =
                        Modifier
                            .width(236.dp)
                            .heightIn(max = 320.dp)
                            .shadow(RikkaTheme.elevation.high, shape)
                            .clip(shape)
                            .background(RikkaTheme.colors.background)
                            .border(1.dp, RikkaTheme.colors.border, shape)
                            .semantics { paneTitle = label }
                            .verticalScroll(rememberScrollState())
                            .padding(4.dp),
                    content = content,
                )
            }
        }
    }
}

@Composable
fun DropdownMenuItem(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null,
    color: Color = RikkaTheme.colors.onBackground,
) {
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .clip(RikkaTheme.shapes.sm)
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) Icon(imageVector = icon, contentDescription = null, tint = color, size = IconSize.Default)
        Text(text = text, variant = TextVariant.Small, color = color, modifier = Modifier.weight(1f))
    }
}

@Composable
fun DropdownMenuSeparator() {
    Separator(modifier = Modifier.padding(vertical = 4.dp))
}

private object MenuPositionProvider : PopupPositionProvider {
    override fun calculatePosition(anchorBounds: IntRect, windowSize: IntSize, layoutDirection: LayoutDirection, popupContentSize: IntSize): IntOffset {
        val x = if (layoutDirection == LayoutDirection.Ltr) anchorBounds.right - popupContentSize.width else anchorBounds.left
        val y = if (anchorBounds.bottom + popupContentSize.height <= windowSize.height) anchorBounds.bottom else anchorBounds.top - popupContentSize.height
        return IntOffset(
            x.coerceIn(0, (windowSize.width - popupContentSize.width).coerceAtLeast(0)),
            y.coerceIn(0, (windowSize.height - popupContentSize.height).coerceAtLeast(0)),
        )
    }
}
