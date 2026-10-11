package org.omicron.mobile.core.designsystem.rikkaui.avatar

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
fun Avatar(fallback: String, modifier: Modifier = Modifier, size: Dp = 40.dp, content: @Composable () -> Unit = {}) {
    val shape = RikkaTheme.shapes.full
    Box(
        modifier = modifier.size(size).clip(shape).background(RikkaTheme.colors.muted).border(1.dp, RikkaTheme.colors.border, shape),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = fallback, variant = if (size >= 64.dp) TextVariant.H3 else TextVariant.Small, color = RikkaTheme.colors.onMuted)
        content()
    }
}
